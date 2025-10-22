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
