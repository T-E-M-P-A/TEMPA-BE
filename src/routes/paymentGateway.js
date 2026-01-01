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
      const idSubscription = parseInt(req.params.id); // Ini benar
      const idCampus = req.user.id;

      const getSubscription = await prisma.subscription_package.findFirst({
        where: {
          id: idSubscription,
        },
        select: {
          id: true,
          price: true,
          package_name: true,
        },
      });

      if (!getSubscription) {
        console.log("Subscription tidak ditemukan");
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      // 1. Ambil dari Dashboard DOKU Anda
      const clientId = CLIENT_ID_DOKU;
      const secretKey = SECRET_KEY;

      // 2. Buat ID Unik & Waktu Sekarang
      const requestId = crypto.randomUUID();
      const timestamp = new Date().toISOString().split(".")[0] + "Z";

      // 3. Siapkan Body Order (Data apa yang dibeli)
      const body = {
        order: {
          amount: Number(getSubscription.price),
          invoice_number: "INV-" + Date.now(),
          currency: "IDR",
        },
        payment: { payment_due_date: 60 },
        payment_method_types: ["QRIS"],
      };

      // 4. Hitung Digest (Hash dari Body)
      const bodyString = JSON.stringify(body);
      const digest = crypto
        .createHash("sha256")
        .update(bodyString)
        .digest("base64");

      // 5. Buat Raw Signature String (Aturan baku DOKU)
      const rawSignature =
        `Client-Id:${clientId}\n` +
        `Request-Id:${requestId}\n` +
        `Request-Timestamp:${timestamp}\n` +
        `Request-Target:/checkout/v1/payment\n` + // Endpoint DOKU
        `Digest:${digest}`;

      // 6. Buat HMAC-SHA256 Signature
      const signature = crypto
        .createHmac("sha256", secretKey)
        .update(rawSignature)
        .digest("base64");

      // console.log("DOKU KREDENSIAL:", {
      //   id: clientId,
      //   secret_length: secretKey ? secretKey.length : 0,
      //   url: "https://api-sandbox.doku.com/checkout/v1/payment",
      // });

      // 7. Request ke DOKU (Menggunakan Axios)
      const dokuResponse = await axios.post(
        "https://api-sandbox.doku.com/checkout/v1/payment",
        body,
        {
          timeout: 20000, // Naikkan ke 20 detik karena koneksi Anda tadi agak lambat
          httpsAgent: new https.Agent({
            keepAlive: true,
            lookup: (hostname, options, callback) => {
              // Custom lookup untuk memastikan DNS tidak macet
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

      // 8. Kirim URL pembayaran ke Frontend React
      return res.status(200).json({
        message: "Berhasil membuat payment intent",
        paymentUrl: dokuResponse.data.response.payment.url, // INI YANG DIBUTUHKAN FRONTEND
      });
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
