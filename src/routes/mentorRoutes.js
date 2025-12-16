import express from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// login admin
router.post("/login-mentor", async (req, res) => {
  const { nik, password } = req.body;

  //   check if username and password null
  if (!nik || !password) {
    return res.status(400).json({
      message: "Username or Password not found!",
    });
  }

  try {
    // search nik mentor
    const mentor = await prisma.mentor.findUnique({
      where: {
        nik: nik,
      },
    });

    // if username not found
    if (!mentor) {
      return res.status(401).json({
        message: "Username not found!",
      });
    }

    // validation password
    const isPasswordValid = await bcrypt.compare(password, mentor.password);

    // if password worng
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Password Wrong!",
      });
    }

    // sign JWT token
    const token = jwt.sign(
      {
        id: mentor.id,
        username: mentor.name,
        nik: mentor.nik,
        mentorType: mentor.mentor_type,
        role: "mentor",
      },
      JWT_SECRET,
      { expiresIn: "1d" } // expired in 1 day
    );

    return res.status(200).json({
      message: "Login mentor success",
      token: token,
      adminId: mentor.name,
    });
  } catch (error) {
    console.error("Kesalahan saat login login:", error);
    return res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
});

// get program campus for chart
router.get(
  "/get-program-campus-chart",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    try {
      const getProgramCampus = await prisma.program_mentor.findMany({
        where: {
          id_mentor: idMentor,
        },
        select: {
          program: {
            select: {
              id: true,
              program_name: true,
              _count: {
                select: {
                  mentee_progress: true,
                },
              },
            },
          },
        },
      });

      // get count total mentee
      const programsWithMenteeCount = getProgramCampus.map((item) => ({
        id: item.program.id,
        program_name: item.program.program_name,
        // Total mentee diambil dari hasil perhitungan _count
        total_mentee: item.program._count.mentee_progress,
      }));

      console.log(programsWithMenteeCount);

      return res.status(200).json({
        message: "Data program beserta total mentee berhasil diambil",
        total_program: programsWithMenteeCount.length,
        data: programsWithMenteeCount,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan saat mengambil data program",
        error: error.message,
      });
    }
  }
);

// test midleware
router.post(
  "/testing-midleware",
  authenticateUser,
  authorizeRoles(["mentor"]),
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
