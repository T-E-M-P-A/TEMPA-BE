import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateCampus } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import formatPathToUrl from "../controllers/formatPathUrl.js"; // Helper untuk format URL gambar

const router = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL; // Pastikan ini diatur di .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// root proyek (TEMPA-BE)
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Path to Interpreter Python VENV (Windows)
const PYTHON_VENV_PATH = path.join(
  PROJECT_ROOT,
  "venv_pddikti",
  "Scripts",
  "python.exe"
);

// uncomment if your system is linux or macos
// const PYTHON_VENV_PATH = path.join(
//   PROJECT_ROOT,
//   "venv_pddikti",
//   "bin",
//   "python3"
// );

// Path Script Python
const PYTHON_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "controllers",
  "dataCampus.py"
);

// =======================================================================
// 1. OAUTH LOGIN CAMPUS
// =======================================================================
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

// =======================================================================
// 2. REGISTER MITRA CAMPUS (Update Data)
// =======================================================================
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
      isCampusVerifiedByApi,
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

      let checkValidationApi = null;

      if (isCampusVerifiedByApi) {
        checkValidationApi = "accepted";
      } else {
        checkValidationApi = "pending";
      }

      // Update data detail kampus
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

      // Update status verifikasi
      const changeVerificationStatus = await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          verification_status: checkValidationApi,
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

// =======================================================================
// 3. CHECK VERIFICATION STATUS CAMPUS
// =======================================================================
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

      if (!getVerification) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      return res.status(200).json({
        message: "Data berhasil didapatkan",
        data: getVerification,
      });
    } catch (error) {
      console.error("Error fetching verification status:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 4. GET ALL PROGRAMS BY CAMPUS ID
// =======================================================================
router.get(
  "/get-program-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const getProgram = await prisma.program.findMany({
        where: {
          id_campus: idCampus,
        },
        include: {
          campus_program_id_majorTocampus: {
            include: {
              standard_major: {
                select: {
                  major_name: true,
                },
              },
            },
          },
          sesi_program: {
            select: {
              type_sesi: true,
              sesi_date: true,
            },
          },
        },
        orderBy: {
          create_at: "desc",
        },
      });

      const formattedPrograms = getProgram.map((item) => {
        const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

        const majorName =
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null;

        const newItem = {
          id: item.id,
          program_name: item.program_name,
          description: item.description,
          start_date: item.start_date,
          end_date: item.end_date,
          capacity: item.capacity,
          program_status: item.program_status,
          major_name: majorName,
          image_url: imageUrl,
          sesi_program: item.type_sesi,
        };

        return newItem;
      });

      console.log(formattedPrograms);

      if (formattedPrograms.length === 0) {
        return res.status(200).json({
          message: "Kampus belum memiliki program yang terdaftar.",
          data: [],
        });
      }

      return res.status(200).json({
        message: "Data program kampus berhasil didapatkan.",
        data: formattedPrograms,
      });
    } catch (error) {
      console.error("Error fetching campus programs:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data program.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 5. GET DETAIL PROGRAM BY ID
// =======================================================================
router.get(
  "/get-detail-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const idProgram = req.params.id;

    try {
      const detailProgram = await prisma.program.findUnique({
        where: {
          id: parseInt(idProgram),
          id_campus: idCampus, // Verifikasi kepemilikan
        },
        include: {
          mentor: {
            select: {
              name: true,
              email: true,
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: {
                select: {
                  major_name: true,
                },
              },
            },
          },
          sesi_program: {
            select: {
              id: true,
              type_sesi: true,
              description: true,
              sesi_date: true,
            },
          },
          _count: {
            select: {
              mentee_progress: true,
            },
          },
        },
      });

      if (!detailProgram) {
        return res.status(404).json({
          message: "Program tidak ditemukan atau bukan milik kampus ini.",
        });
      }

      const item = detailProgram;

      // FORMAT PATH GAMBAR PROGRAM UTAMA
      const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

      // BUAT OBJEK HASIL AKHIR
      const formattedDetail = {
        ...item,
        image_url: imageUrl,
        major_name:
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null,
        registered_mentees: item._count.mentee_progress,
      };

      // Bersihkan properti yang tidak diperlukan lagi (opsional)
      delete formattedDetail.path_gambar;
      delete formattedDetail.id_campus;
      delete formattedDetail.id_mentor;
      delete formattedDetail.id_major;
      delete formattedDetail.id_session_type;
      delete formattedDetail.campus_program_id_majorTocampus;
      delete formattedDetail._count;

      console.log(formattedDetail);

      return res.status(200).json({
        message: "Detail program berhasil ditemukan.",
        data: formattedDetail,
      });
    } catch (error) {
      console.error("Error fetching detail program:", error);
      // Handle error jika idProgram tidak valid (misalnya bukan integer)
      if (error.message.includes("id must be of type integer")) {
        return res.status(400).json({
          message: "ID Program tidak valid.",
          error: error.message,
        });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil detail program.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 6. GET DATA CAMPUS FOR VALIDATION (Menggunakan Python)
// =======================================================================
router.get("/validate-campus/:campusName", (req, res) => {
  const { campusName } = req.params;

  if (!campusName) {
    return res
      .status(400)
      .json({ status: "error", message: 'Parameter "campusName" diperlukan.' });
  }

  // Gunakan spawn untuk menjalankan proses Python
  const pythonProcess = spawn(PYTHON_VENV_PATH, [
    PYTHON_SCRIPT_PATH,
    campusName, // Argumen untuk Python
  ]);

  let outputData = "";
  let errorData = "";

  // Tangkap output (stdout) dari skrip Python
  pythonProcess.stdout.on("data", (data) => {
    outputData += data.toString();
  });

  // Tangkap error (stderr) dari skrip Python
  pythonProcess.stderr.on("data", (data) => {
    errorData += data.toString();
  });

  // Tangani penutupan proses
  pythonProcess.on("close", (code) => {
    if (code !== 0) {
      console.error(
        `Python script exited with code ${code}. Stderr: ${errorData}`
      );
      // Coba parse outputData jika berisi error JSON dari Python
      try {
        const errorResult = JSON.parse(outputData);
        if (errorResult.status === "error") {
          return res.status(500).json(errorResult);
        }
      } catch (e) {
        // Jika output bukan JSON error, kirim pesan error generik
        return res.status(500).json({
          status: "error",
          message: "Gagal menjalankan validasi kampus (Internal Server Error).",
        });
      }
    }

    try {
      // Parse output JSON dari Python
      const result = JSON.parse(outputData);
      console.log(result);

      // Kirim hasil ke frontend
      return res.json(result);
    } catch (e) {
      console.error("Failed to parse Python output:", outputData);
      return res.status(500).json({
        status: "error",
        message: "Gagal memproses hasil dari Python.",
      });
    }
  });
});

// get program campus for chart
router.get(
  "/get-program-campus-chart",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    try {
      const getProgramCampus = await prisma.program.findMany({
        where: {
          id_campus: idCampus,
        },
        select: {
          id: true,
          program_name: true,
          _count: {
            select: {
              mentee_progress: true,
            },
          },
        },
      });

      // get count total mentee
      const programsWithMenteeCount = getProgramCampus.map((program) => ({
        id: program.id,
        program_name: program.program_name,
        // Total mentee diambil dari hasil perhitungan _count
        total_mentee: program._count.mentee_progress,
      }));

      console.log(programsWithMenteeCount);

      return res.status(200).json({
        message: "Data program beserta total mentee berhasil diambil",
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
  "/testing-midleware-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const { test } = req.body;

    try {
      return res.status(200).json({
        message: "Middleware campus berhasil",
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error di test middleware",
        error: error.message,
      });
    }
  }
);

export default router;
