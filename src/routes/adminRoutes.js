import express, { json } from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

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
