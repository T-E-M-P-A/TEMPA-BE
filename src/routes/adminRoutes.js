import express, { json } from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import nodemailer from "nodemailer";
import path from "path";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

// login admin
router.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;

  //   check if username and password null
  if (!username || !password) {
    return res.status(400).json({
      message: "Username or Password not found!",
    });
  }

  try {
    // search username admin
    const admin = await prisma.admin.findUnique({
      where: {
        username: username,
      },
    });

    // if username not found
    if (!admin) {
      return res.status(401).json({
        message: "Username tidak ditemukan!",
      });
    }

    // validation password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    // if password worng
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Kata sandi salah!",
      });
    }

    // sign JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: "admin",
      },
      JWT_SECRET,
      { expiresIn: "1d" } // expired in 1 day
    );

    return res.status(200).json({
      message: "Login admin berhasil",
      token: token,
      adminId: admin.id,
    });
  } catch (error) {
    console.error("Kesalahan saat login admin:", error);
    return res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
});

// get dashboard data for admin (total campus, program, mentee, and chart data)
router.get(
  "/get-dashboard-data",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      // Menggunakan Promise.all untuk efisiensi query paralel
      const [totalCampus, totalProgram, totalMentee, campusPrograms] =
        await Promise.all([
          // 1. Total Campus Accepted
          prisma.campus.count({
            where: {
              verification_status: "accepted",
            },
          }),
          // 2. Total Program
          prisma.program.count(),
          // 3. Total Mentee
          prisma.mentee.count(),
          // 4. Data Kampus untuk Chart (Jumlah Program per Kampus)
          prisma.campus.findMany({
            where: {
              verification_status: "accepted",
            },
            select: {
              campus_name: true,
              _count: {
                select: {
                  program_program_id_campusTocampus: true, // Relasi ke tabel program
                },
              },
            },
          }),
        ]);

      // Format data untuk chart
      const chartData = campusPrograms.map((item) => ({
        campus_name: item.campus_name,
        total_program: item._count.program_program_id_campusTocampus,
      }));

      return res.status(200).json({
        message: "Data dashboard berhasil diambil",
        data: {
          total_campus_accepted: totalCampus,
          total_program: totalProgram,
          total_mentee: totalMentee,
          program_per_campus: chartData,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan saat mengambil data dashboard",
        error: error.message,
      });
    }
  }
);

// get all campus data for admin
router.get(
  "/get-all-campus",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const allCampus = await prisma.campus.findMany({
        select: {
          id: true,
          campus_name: true,
          path_logo: true,
          verification_status: true,
        },
        orderBy: {
          campus_name: "asc",
        },
      });

      const formattedCampus = allCampus.map((campus) => ({
        id: campus.id,
        campus_name: campus.campus_name,
        verification_status: campus.verification_status,
        logo_url: formatPathToUrl(campus.path_logo, BASE_URL),
      }));

      return res.status(200).json({
        message: "Data kampus berhasil diambil",
        data: formattedCampus,
      });
    } catch (error) {
      console.error("Gagal mengambil data kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data kampus",
        error: error.message,
      });
    }
  }
);

// get detail campus by id for admin
router.get(
  "/get-detail-verification-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    try {
      const campus = await prisma.campus.findUnique({
        where: {
          id: idCampus,
        },
        select: {
          id: true,
          campus_name: true,
          email_campus: true,
          description: true,
          website_campus: true,
          province: true,
          city: true,
          subdistrict: true,
          ward: true,
          lat: true,
          lng: true,
        },
      });

      if (!campus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      return res.status(200).json({
        message: "Detail kampus berhasil diambil",
        data: campus,
      });
    } catch (error) {
      console.error("Gagal mengambil detail kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil detail kampus",
        error: error.message,
      });
    }
  }
);

// update verification status campus to accepted
router.put(
  "/accept-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    try {
      // Cek keberadaan kampus
      const existingCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
      });

      if (!existingCampus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      // Update status menjadi accepted
      const updatedCampus = await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          verification_status: "accepted",
        },
      });

      return res.status(200).json({
        message: "Status verifikasi kampus berhasil diubah menjadi accepted",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal mengubah status kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengubah status kampus",
        error: error.message,
      });
    }
  }
);

// reject campus and send email notification
router.put(
  "/reject-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    if (!reason) {
      return res.status(400).json({
        message: "Alasan penolakan wajib diisi.",
      });
    }

    try {
      // Cek keberadaan kampus
      const existingCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
      });

      if (!existingCampus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      // Update status menjadi rejected
      const updatedCampus = await prisma.campus.update({
        where: { id: idCampus },
        data: { verification_status: "rejected" },
      });

      // Konfigurasi Nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail", // Sesuaikan dengan provider email Anda (misal: gmail)
        auth: {
          user: process.env.EMAIL_USER, // Pastikan env ini diset
          pass: process.env.EMAIL_PASS, // Pastikan env ini diset (App Password jika Gmail)
        },
      });

      // Path ke logo lokal
      const logoPath = path.join(process.cwd(), "assets", "logo-text.png");

      // Kirim Email
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: existingCampus.email, // Mengirim ke email akun kampus
        subject: "Pemberitahuan Verifikasi Kampus - Ditolak",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <!-- Ganti src dengan URL logo publik aplikasi Anda -->
              <img src="cid:logoTempa" alt="TEMPA Logo" style="max-width: 150px; height: auto;" />
            </div>
            <h2 style="color: #333; text-align: center;">Status Verifikasi Kampus</h2>
            <p style="font-size: 16px; color: #555;">Halo <strong>${existingCampus.campus_name}</strong>,</p>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">
              Terima kasih telah mendaftar di platform kami. Setelah melakukan peninjauan data, kami mohon maaf untuk menginformasikan bahwa pengajuan verifikasi akun kampus Anda <strong>DITOLAK</strong>.
            </p>
            <div style="background-color: #fff5f5; border-left: 5px solid #ff4d4f; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #cf1322;">Alasan Penolakan:</p>
              <p style="margin: 5px 0 0; color: #555;">${reason}</p>
            </div>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">
              Silakan perbaiki data Anda sesuai dengan alasan di atas dan ajukan kembali verifikasi melalui dashboard.
            </p>
            <br>
            <p style="font-size: 16px; color: #555;">Salam hangat,<br><strong>Tim Admin TEMPA</strong></p>
          </div>
        `,
        attachments: [
          {
            filename: "logo-text.png",
            path: logoPath,
            cid: "logoTempa", // Harus sama dengan cid di tag img src
          },
        ],
      });

      return res.status(200).json({
        message: "Kampus berhasil ditolak dan email notifikasi terkirim.",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal menolak kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menolak kampus.",
        error: error.message,
      });
    }
  }
);

// test midleware
router.post(
  "/testing-midleware",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { test } = req.body;
    try {
      return res.status(200).json({
        message: "Middleware berhasil",
      });
    } catch (error) {
      return res.json({
        message: error,
      });
    }
  }
);

export default router;
