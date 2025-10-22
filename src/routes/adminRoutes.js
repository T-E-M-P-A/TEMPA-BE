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
        message: "Username not found!",
      });
    }

    // validation password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    // if password worng
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Password Wrong!",
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
      message: "Login admin success",
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
