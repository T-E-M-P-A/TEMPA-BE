import express from "express";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import axios from "axios";
import crypto from "crypto";
import https from "https";
import dns from "dns";

const router = express.Router();

const CLIENT_ID_DOKU = process.env.CLIENT_ID_DOKU;
const SECRET_KEY = process.env.SECRET_KEY;

router.post(
  "/create-payment-intent/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    try {
      const idSubscription = parseInt(req.params.id);
      const idCampus = req.user.id;

      const getSubscription = await prisma.subscription_package.findFirst({
        where: {
          id: idSubscription,
        },
        select: {
          id: true,
          price: true,
          package_name: true,
          free_trial: true,
          duration_month: true,
        },
      });

      if (!getSubscription) {
        console.log("Subscription tidak ditemukan");
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      // verivication account campus
      const getCampus = await prisma.campus.findFirst({
        where: {
          id: idCampus,
        },
        select: {
          id: true,
          verification_status: true,
        },
      });

      if (!getCampus) {
        return res.status(404).json({ message: "Kampus tidak ditemukan" });
      }

      // check verivication campus
      if (
        getCampus.verification_status === "null" ||
        getCampus.verification_status === "rejected" ||
        getCampus.verification_status === "pending"
      ) {
        return res.status(403).json({
          message: "Akun kampus belum diverifikasi. Silakan hubungi admin.",
        });
      }

      // get doku key
      const clientId = CLIENT_ID_DOKU;
      const secretKey = SECRET_KEY;

      // create unique id & get time
      const requestId = crypto.randomUUID();
      const timestamp = new Date().toISOString().split(".")[0] + "Z";

      // create body order
      const body = {
        order: {
          amount: Number(getSubscription.price),
          invoice_number: "INV-" + Date.now(),
          currency: "IDR",
        },
        payment: { payment_due_date: 60 },
        payment_method_types: ["QRIS"],
      };

      // 4. hash body
      const bodyString = JSON.stringify(body);
      const digest = crypto
        .createHash("sha256")
        .update(bodyString)
        .digest("base64");

      // create Raw Signature String (standard rules DOKU)
      const rawSignature =
        `Client-Id:${clientId}\n` +
        `Request-Id:${requestId}\n` +
        `Request-Timestamp:${timestamp}\n` +
        `Request-Target:/checkout/v1/payment\n` + // Endpoint DOKU
        `Digest:${digest}`;

      // create HMAC-SHA256 Signature
      const signature = crypto
        .createHmac("sha256", secretKey)
        .update(rawSignature)
        .digest("base64");

      // console.log("DOKU KREDENSIAL:", {
      //   id: clientId,
      //   secret_length: secretKey ? secretKey.length : 0,
      //   url: "https://api-sandbox.doku.com/checkout/v1/payment",
      // });

      if (getSubscription.free_trial) {
        const getCampusSubscription =
          await prisma.campus_subscription.findFirst({
            where: {
              id_campus: idCampus,
              // id_package: idSubscription,
              status: "active",
            },
            select: {
              id_package: true,
            },
          });

        const PackageName = await prisma.subscription_package.findFirst({
          where: {
            id: getCampusSubscription.id_package,
          },
          select: {
            package_name: true,
          },
        });

        // check if campus already have subscription
        if (getCampusSubscription) {
          return res.status(400).json({
            message: `Anda sudah berlangganan untuk paket ${PackageName.package_name}`,
          });
        }

        // for free trial package subscription
        if (!getCampusSubscription)
          await prisma.transaction.create({
            data: {
              transaction_date: new Date(),
              doku_invoice_no: "INV-FREE-" + Date.now(),
              payment_channel: "FREE_TRIAL",
              status: "paid",
              id_campus: idCampus,
              transaction_no: "TRX-" + Date.now(),
              id_package: idSubscription,
              free_trial: true,
              amount_original: getSubscription.price,
              amount_final: 0,
              duration_month: getSubscription.duration_month,
              paid_at: new Date(),
            },
          });

        // activate campus subscription
        const startDate = new Date();
        const expiredDate = new Date(startDate);
        expiredDate.setMonth(
          expiredDate.getMonth() + getSubscription.duration_month
        );

        await prisma.campus_subscription.create({
          data: {
            doku_invoice: 0,
            status: "active",
            id_campus: idCampus,
            id_package: idSubscription,
            start_date: startDate,
            expired_date: expiredDate,
            updated_at: new Date(),
          },
        });

        return res.status(200).json({
          message: "Free trial berhasil diaktifkan",
          isFree: true, // Flag for frontend
        });
      } else {
        // for paid subscription packages
        const dokuResponse = await axios.post(
          "https://api-sandbox.doku.com/checkout/v1/payment",
          body,
          {
            timeout: 20000,
            httpsAgent: new https.Agent({
              keepAlive: true,
              lookup: (hostname, options, callback) => {
                dns.lookup(hostname, options, callback);
              },
            }),
            headers: {
              "Client-Id": clientId,
              "Request-Id": requestId,
              "Request-Timestamp": timestamp,
              Signature: `HMACSHA256=${signature}`,
            },
          }
        );

        return res.status(200).json({
          message: "Berhasil membuat payment intent",
          paymentUrl: dokuResponse.data.response.payment.url, // send response result from hit api doku for frontend
        });
      }
    } catch (error) {
      console.error(error.response?.data || error.message);
      return res.status(500).json({
        message: "Terjadi kesalahan",
        error: error.message,
      });
    }
  }
);

export default router;
