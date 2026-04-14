import express from "express";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import axios from "axios";

const router = express.Router();

const FE_BASE_URL = process.env.FE_BASE_URL;
const API_KEY_PAYMENTKU = process.env.API_KEY_PAYMENTKU;

// create invoice for subscription feature
router.post(
  "/create-payment-invoice/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const idSubscription = parseInt(req.params.id);

    try {
      // get feat subscription
      const getSubscriptionPackage =
        await prisma.subscription_package.findFirst({
          where: {
            id: idSubscription,
          },
          select: {
            id: true,
            price: true,
            package_name: true,
            duration_month: true,
          },
        });

      const getCampus = await prisma.campus.findFirst({
        where: {
          id: idCampus,
        },
        select: {
          campus_name: true,
          email: true,
        },
      });

      // 1. Gunakan timestamp agar unik dan ringkas
      const timestamp = Date.now();
      const invoiceNo = `INV-${timestamp}`;
      const transactionNo = `TRX-${timestamp}`;

      const body = {
        reference_id: invoiceNo, // Gunakan variabel yang sama
        amount: Number(getSubscriptionPackage.price),
        customer_name: getCampus.campus_name,
        customer_email: getCampus.email,
        channel_code: "qris",
        return_url: `${FE_BASE_URL}/dashboard-campus/berlangganan`,
      };

      const paymentkuResponse = await axios.post(
        "https://paymenku.com/api/v1/transaction/create",
        body,
        {
          headers: {
            Authorization: `Bearer ${API_KEY_PAYMENTKU}`,
          },
        },
      );

      // create transaction
      if (paymentkuResponse) {
        const createTransaction = await prisma.transaction.create({
          data: {
            transaction_date: new Date(),
            invoice_no: invoiceNo,
            payment_channel: "qris",
            status: "pending",
            id_campus: idCampus,
            transaction_no: transactionNo,
            id_package: idSubscription,
            free_trial: false,
            amount_original: getSubscriptionPackage.price,
            amount_final: 0,
            duration_month: getSubscriptionPackage.duration_month,
            paid_at: new Date(),
            type_payment: "subscription",
          },
        });
      }

      // Selalu kirim status 200 agar Mayar tidak mengirim ulang webhook
      res.status(200).json({
        statusCode: 200,
        messages: "success",
        data: paymentkuResponse.data.data,
      });
    } catch (error) {
      console.error("Paymentku Error:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      if (error.response) {
        return res.status(error.response.status).json({
          statusCode: error.response.status,
          messages: "Gagal membuat transaksi pembayaran",
          errors:
            error.response.data.message || "Kesalahan pada penyedia pembayaran",
        });
      } else if (error.request) {
        return res.status(503).json({
          statusCode: 503,
          messages: "Layanan pembayaran tidak dapat dijangkau",
          errors: "Koneksi ke payment gateway terputus.",
        });
      } else {
        return res.status(500).json({
          statusCode: 500,
          messages: "Internal Server Error",
          errors: error.message,
        });
      }
    }
  },
);

// top up saldo deposit
router.post(
  "/top-up-saldo",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { amount } = req.body;

    try {
      const getCampus = await prisma.campus.findFirst({
        where: {
          id: idCampus,
        },
        select: {
          campus_name: true,
          email: true,
        },
      });

      // 1. Gunakan timestamp agar unik dan ringkas
      const timestamp = Date.now();
      const invoiceNo = `INV-${timestamp}`;
      const transactionNo = `TRX-${timestamp}`;

      const body = {
        reference_id: invoiceNo, // Gunakan variabel yang sama
        amount: Number(amount),
        customer_name: getCampus.campus_name,
        customer_email: getCampus.email,
        channel_code: "qris",
        return_url: `${FE_BASE_URL}/dashboard-campus/berlangganan`,
      };

      const paymentkuResponse = await axios.post(
        "https://paymenku.com/api/v1/transaction/create",
        body,
        {
          headers: {
            Authorization: `Bearer ${API_KEY_PAYMENTKU}`,
          },
        },
      );

      // create transaction
      if (paymentkuResponse) {
        const createTransaction = await prisma.transaction.create({
          data: {
            transaction_date: new Date(),
            invoice_no: invoiceNo,
            payment_channel: "qris",
            status: "pending",
            id_campus: idCampus,
            transaction_no: transactionNo,
            id_package: null,
            free_trial: false,
            amount_original: amount,
            amount_final: 0,
            duration_month: null,
            paid_at: new Date(),
            type_payment: "topup",
          },
        });
      }

      // Selalu kirim status 200 agar Mayar tidak mengirim ulang webhook
      res.status(200).json({
        statusCode: 200,
        messages: "success",
        data: paymentkuResponse.data.data,
      });
    } catch (error) {
      console.error("Paymentku Error:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      if (error.response) {
        return res.status(error.response.status).json({
          statusCode: error.response.status,
          messages: "Gagal membuat transaksi pembayaran",
          errors:
            error.response.data.message || "Kesalahan pada penyedia pembayaran",
        });
      } else if (error.request) {
        return res.status(503).json({
          statusCode: 503,
          messages: "Layanan pembayaran tidak dapat dijangkau",
          errors: "Koneksi ke payment gateway terputus.",
        });
      } else {
        return res.status(500).json({
          statusCode: 500,
          messages: "Internal Server Error",
          errors: error.message,
        });
      }
    }
  },
);

// webhooks paymenku
router.post("/webhook-paymentku", async (req, res) => {
  const payload = req.body;

  try {
    // 1. Cari transaksi & pastikan ada
    const trx = await prisma.transaction.findUnique({
      where: { invoice_no: payload.reference_id },
    });

    if (!trx)
      return res.status(404).json({ messages: "Transaction not found" });

    // 2. CEK IDEMPOTENCY: Jika sudah sukses, jangan proses lagi!
    if (trx.status === "paid" || trx.status === "success") {
      return res.status(200).json({ messages: "Already processed" });
    }

    // 3. Update status transaksi utama
    const updateTransaction = await prisma.transaction.update({
      where: { invoice_no: payload.reference_id },
      data: {
        status: payload.status,
        amount_final: Number(payload.amount),
        paid_at: payload.paid_at,
      },
    });

    // 4. EKSEKUSI HANYA JIKA STATUS 'paid'
    if (payload.status === "paid") {
      const idCampus = updateTransaction.id_campus;

      if (updateTransaction.type_payment === "subscription") {
        // --- LOGIKA SUBSCRIPTION ---
        const startDate = updateTransaction.paid_at;
        const expiredDate = new Date(startDate);
        // Pastikan duration_month ada nilainya
        const duration = updateTransaction.duration_month || 1;
        expiredDate.setMonth(expiredDate.getMonth() + duration);

        // Gunakan upsert agar lebih ringkas
        await prisma.campus_subscription.upsert({
          where: { id_campus: idCampus },
          update: {
            invoice_no: updateTransaction.invoice_no,
            status: "active",
            id_package: updateTransaction.id_package,
            start_date: startDate,
            expired_date: expiredDate,
            updated_at: new Date(),
          },
          create: {
            id_campus: idCampus,
            invoice_no: updateTransaction.invoice_no,
            status: "active",
            id_package: updateTransaction.id_package,
            start_date: startDate,
            expired_date: expiredDate,
            updated_at: new Date(),
          },
        });

        // Mapping Bonus Saldo
        const depositMap = { 1: 1500000, 2: 2500000 };
        const amountToDeposit = depositMap[updateTransaction.id_package] || 0;

        if (amountToDeposit > 0) {
          const updateCampusWallet = await prisma.campus_wallet.update({
            where: {
              id_campus: updateTransaction.id_campus,
            },
            data: {
              current_balance: {
                increment: amountToDeposit,
              },
              last_transaction_id: updateTransaction.id,
              update_at: new Date(),
            },
          });
        }

        // create wallet log
        const updateWalletLog = await prisma.wallet_log.create({
          data: {
            id_campus: updateTransaction.id_campus,
            amount: amountToDeposit,
            type: "topup",
            created_at: new Date(),
          },
        });
      } else {
        const updateCampusWallet = await prisma.campus_wallet.update({
          where: {
            id_campus: updateTransaction.id_campus,
          },
          data: {
            current_balance: {
              increment: Number(payload.amount_received),
            },
            last_transaction_id: updateTransaction.id,
            update_at: new Date(),
          },
        });

        const updateWalletLog = await prisma.wallet_log.create({
          data: {
            id_campus: updateTransaction.id_campus,
            amount: Number(payload.amount_received),
            type: "topup",
            created_at: new Date(),
          },
        });
      }
    }

    return res.status(200).json({ statusCode: 200, messages: "success" });
  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).json({ messages: "Internal Server Error" });
  }
});

// get balance for campus
router.get(
  "/get-balance",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const [getBalance, getSubscriptionCampus] = await Promise.all([
        prisma.campus_wallet.findUnique({
          where: { id_campus: idCampus },
        }),
        prisma.campus_subscription.findFirst({
          where: { id_campus: idCampus, status: "active" },
        }),
      ]);

      if (!getBalance) {
        return res.status(404).json({
          statusCode: 404,
          messages: "Dompet kampus tidak ditemukan. Silakan hubungi admin.",
        });
      }

      if (!getSubscriptionCampus) {
        return res.status(200).json({
          statusCode: 200,
          messages: "Kampus belum memiliki paket langganan aktif.",
          data: {
            balance: Number(getBalance.current_balance),
            quota_mentee: 0,
          },
        });
      }

      // price per mentee
      const menteePriceMap = {
        1: 15000, // Paket Berkembang
        2: 20000, // Paket Eksklusif
      };

      // const packageId = getSubscriptionPackage.id;
      const pricePerMentee = 15000;

      const totalQuota =
        pricePerMentee > 0
          ? Math.floor(Number(getBalance.current_balance) / pricePerMentee)
          : 0;

      const data = {
        balance: Number(getBalance.current_balance),
        quota_mentee: totalQuota,
      };

      return res.status(200).json({
        statusCode: 200,
        messages: "success",
        data: data,
      });
    } catch (error) {
      console.error(`[GetBalance Error] Campus ID ${idCampus}:`, error);

      return res.status(500).json({
        statusCode: 500,
        messages: "Terjadi kesalahan internal pada server.",
      });
    }
  },
);

// get history transaction
router.get(
  "/get-history-transaction",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const getWalletLog = await prisma.wallet_log.findMany({
        where: {
          id_campus: idCampus,
        },
        orderBy: {
          created_at: "desc",
        },
      });

      if (getWalletLog.length === 0) {
        return res.status(200).json({
          // Gunakan 200, karena list kosong bukan berarti error/404
          statusCode: 200,
          messages: "Belum ada riwayat transaksi.",
          data: [],
        });
      }

      const formattedData = getWalletLog.map((log) => ({
        id: log.id,
        id_campus: log.id_campus,
        amount: Number(log.amount),
        type: log.type,
        created_at: log.created_at,
        // Tips: Tambahkan status/label untuk mempermudah frontend
        is_money_out: Number(log.amount) < 0,
      }));

      return res.status(200).json({
        statusCode: 200,
        messages: "success",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error Get Wallet Log:", error);

      return res.status(500).json({
        statusCode: 500,
        messages: "Terjadi kesalahan internal pada server.",
      });
    }
  },
);

export default router;
