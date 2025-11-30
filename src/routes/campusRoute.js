import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateCampus } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";

const router = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;

// Oauth mentee with google
router.post("/login-campus", async (req, res) => {
  const token = req.body.credential;

  if (!token) {
    return res.status(400).json({ error: "No credential token provided." });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error("Invalid token payload.");
    }

    const { name, sub, email } = payload;

    // get id user or add user
    const userRecord = await findOrCreateCampus(payload);

    // get user ID
    const localUserId = userRecord.id;

    const verifData = await prisma.campus.findFirst({
      where: {
        id: localUserId,
      },
      select: {
        verification_status: true,
        campus_name: true,
      },
    });

    console.log(verifData);

    const jwtPayload = {
      id: localUserId, // id user
      username: name,
      email: email,
      role: "campus",
      verif: verifData,
    };

    // Buat token JWT
    const signedJwtToken = jwt.sign(
      jwtPayload,
      JWT_SECRET,
      { expiresIn: "1d" } // expired in 1 day
    );

    res.status(200).json({
      message: "Login successful!",
      data: {
        token: signedJwtToken,
        fullName: name,
        uniqueId: localUserId,
        email: email,
      },
    });
  } catch (error) {
    console.error("Token verification failed:", error.message);
    res.status(401).json({ error: "Authentication failed. Invalid token." });
  }
});

// register mitra campus
router.post(
  "/register-mitra-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const {
      campusName,
      emailCampus,
      description,
      websiteCampus,
      province,
      city,
      subdistrict,
      ward,
      lat,
      lng,
    } = req.body;
    const idCampus = req.user.id;

    const requiredFields = [
      "campusName",
      "emailCampus",
      "description",
      "websiteCampus",
      "province",
      "city",
      "subdistrict",
      "ward",
      "lat",
      "lng",
    ];

    // check if req is null
    for (const field of requiredFields) {
      const value = req.body[field];

      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return res.status(400).json({
          // 400 Bad Request
          message: `Gagal: Kolom '${field}' wajib diisi dan tidak boleh kosong.`,
        });
      }
    }

    // check format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailCampus)) {
      return res.status(400).json({
        message: "Gagal: Format email tidak valid.",
      });
    }

    try {
      // convertion to float
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      // check if lat and lng value is float
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({
          message:
            "Gagal: Latitude (lat) dan Longitude (lng) harus berupa angka yang valid.",
        });
      }

      const saveDataCampus = await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          campus_name: campusName,
          email_campus: emailCampus,
          description: description,
          website_campus: websiteCampus,
          province: province,
          city: city,
          subdistrict: subdistrict,
          ward: ward,
          lat: parsedLat,
          lng: parsedLng,
        },
      });

      const changeVerificationStatus = await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          verification_status: "pending",
        },
      });

      return res.status(200).json({
        message: "Campus Berhasil Register",
        data: saveDataCampus,
      });
    } catch (error) {
      console.error("Prisma Error:", error);

      // error unique email
      if (error.code === "P2002") {
        return res.status(409).json({
          message: "Email kampus sudah terdaftar (pelanggaran unik).",
        });
      }
      // error validation input
      if (error.name === "PrismaClientValidationError") {
        return res.status(400).json({
          message:
            "Kesalahan validasi input data. Cek fields yang wajib diisi.",
          details: error.message,
        });
      }

      return res.status(500).json({
        message: "Terjadi kesalahan server saat menyimpan data.",
        error: error.message,
      });
    }
  }
);

// check verification status campus
router.get(
  "/check-verification-status",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const getVerification = await prisma.campus.findFirst({
        where: {
          id: idCampus,
        },
        select: {
          verification_status: true,
        },
      });

      console.log(getVerification);

      return res.status(200).json({
        message: "Data berhasil didapatkan",
        data: getVerification,
      });
    } catch (error) {
      return res.json({
        message: error,
      });
    }
  }
);

// test midleware
router.post(
  "/testing-midleware-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const { test } = req.body;

    try {
      return res.status(200).json({
        message: "Middleware mentee berhasil",
      });
    } catch (error) {
      return res.json({
        message: error,
      });
    }
  }
);

export default router;
