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
import multer from "multer";
import fs from "fs"; // <-- Impor modul 'fs' untuk operasi file
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
// MULTER CONFIG FOR PROGRAM IMAGE
// =======================================================================
const programImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/program_images";
    // Buat direktori jika belum ada
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "program-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadProgramImage = multer({
  storage: programImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!"));
    }
  },
});

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
          start_date: item.start_program_date,
          end_date: item.end_program_date,
          capacity: item.capacity,
          program_status: item.program_status,
          onsiteLocationName: item.onsiteLocationName,
          major_name: majorName,
          image_url: imageUrl,
          sesi_program: item.type_sesi,
          visibility: item.visibility,
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
    const parsedIdProgram = parseInt(idProgram);

    // Validasi ID Program
    if (isNaN(parsedIdProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    try {
      const detailProgram = await prisma.program.findUnique({
        where: {
          id: parsedIdProgram,
          id_campus: idCampus, // Verifikasi kepemilikan
        },
        include: {
          program_mentor: {
            where: {
              id_program: parsedIdProgram,
            },
            include: {
              mentor: {
                select: {
                  name: true,
                  nik: true,
                },
              },
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: {
                select: {
                  id: true,
                  major_name: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN MATERI PROGRAM
          materi: {
            select: {
              id: true,
              title: true,
              description: true,
              visibility: true,
              // Anda bisa tambahkan materi_resource jika perlu detail file
              materi_resource: {
                select: {
                  type: true,
                  path_file: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN PROGRESS MENTEE (PESERTA)
          mentee_progress: {
            select: {
              completion_status: true,
              final_score: true,
              mentee: {
                // Relasi ke detail mentee
                select: {
                  username: true,
                  email: true,
                  gender: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN COUNT UNTUK TOTAL PESERTA TERDAFTAR
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
      const formattedMateriList = item.materi.map((materi) => ({
        ...materi,
        // Lakukan mapping pada materi_resource
        materi_resource: materi.materi_resource.map((resource) => ({
          ...resource,
          // Gunakan fungsi formatPathToUrl untuk path_file
          resource_url: formatPathToUrl(resource.path_file, BASE_URL),
          // Hapus path_file yang mentah (opsional, tapi disarankan)
          // delete resource.path_file;
        })),
      }));

      // BUAT OBJEK HASIL AKHIR
      const formattedDetail = {
        ...item,
        image_url: imageUrl,
        major_name:
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null,
        registered_mentees: item._count?.mentee_progress || 0,
        // ✅ MAP dan bersihkan list mentee agar lebih mudah diakses di frontend
        mentee_list: item.mentee_progress.map((mp) => ({
          username: mp.mentee?.username,
          email: mp.mentee?.email,
          gender: mp.mentee?.gender,
          completion_status: mp.completion_status,
          final_score: mp.final_score,
        })),
        // ✅ Gunakan data materi yang sudah diformat
        materi_list: formattedMateriList,
      };

      // Bersihkan properti yang tidak diperlukan lagi (opsional)
      delete formattedDetail.path_gambar;
      delete formattedDetail.id_campus;
      delete formattedDetail.id_mentor;
      delete formattedDetail.id_session_type;
      delete formattedDetail.campus_program_id_majorTocampus;
      delete formattedDetail._count;
      // Hapus mentee_progress mentah yang sudah dipetakan
      delete formattedDetail.mentee_progress;
      delete formattedDetail.materi; // Hapus materi mentah

      console.log(formattedDetail);

      return res.status(200).json({
        message: "Detail program berhasil ditemukan.",
        data: formattedDetail,
      });
    } catch (error) {
      console.error("Error fetching detail program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil detail program.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 6. GET ALL MENTEE WHERE REGISTERED PROGRAM BY ID
// =======================================================================
router.get(
  "/get-detail-program-total-mentee/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const idProgram = req.params.id;

    try {
      // ✅ GANTI DARI findMany MENJADI findFirst
      const programData = await prisma.program.findFirst({
        where: {
          id: parseInt(idProgram),
          id_campus: idCampus, // Verifikasi kepemilikan
        },
        select: {
          mentee_progress: {
            select: {
              mentee: {
                select: {
                  username: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              mentee_progress: true,
            },
          },
        },
      });

      if (!programData) {
        return res.status(404).json({
          message: "Program tidak ditemukan atau bukan milik kampus ini.",
        });
      }

      const formattedData = {
        total_mentee: programData._count.mentee_progress,
        // Merapikan list mentee
        mentees: programData.mentee_progress.map((mp) => ({
          username: mp.mentee?.username,
          email: mp.mentee?.email,
        })),
      };

      console.log(formattedData);

      return res.status(200).json({
        message: "Data program beserta detail mentee berhasil diambil",
        data: formattedData, // ✅ MENGEMBALIKAN OBJEK YANG SUDAH DIFORMAT
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
// 7. GET DATA CAMPUS FOR VALIDATION (Menggunakan Python)
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

// =======================================================================
// CREATE NEW PROGRAM
// =======================================================================
router.post(
  "/create-program",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadProgramImage.single("bannerImage"),
  async (req, res) => {
    const idCampus = req.user.id;

    // Validasi file upload
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Gambar banner program wajib diunggah." });
    }

    const {
      name,
      majorName,
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits, // JSON string
      terms, // JSON string
      location_name,
      mapLat,
      mapLng,
    } = req.body;

    console.log(req.body);

    // Validasi field wajib
    const requiredFields = {
      name,
      majorName,
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits,
      terms,
    };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res
          .status(400)
          .json({ message: `Field '${field}' wajib diisi.` });
      }
    }

    try {
      // 1. Konversi majorName (yang sebenarnya adalah majorId) ke integer
      const majorId = parseInt(majorName, 10);
      if (isNaN(majorId)) {
        return res
          .status(400)
          .json({ message: "Format ID Jurusan tidak valid." });
      }

      // 2. Cari Major berdasarkan ID-nya dan pastikan milik kampus yang login
      const major = await prisma.major.findFirst({
        where: {
          id: majorId,
          id_campus: parseInt(idCampus),
        },
        select: {
          id: true,
        },
      });
      if (!major) {
        return res.status(404).json({
          message: `Jurusan dengan ID '${majorId}' tidak ditemukan atau bukan milik kampus Anda.`,
        });
      }

      // 2. Konversi tipe data

      // Fungsi helper untuk mem-parsing benefits dan terms dengan aman
      const parseJsonOrWrapInArray = (value) => {
        if (typeof value === "string") {
          try {
            // Coba parse sebagai JSON, jika frontend mengirim format array string
            return JSON.parse(value);
          } catch (e) {
            // Jika gagal, anggap itu adalah string yang dipisahkan koma.
            // Pecah string berdasarkan koma, hapus spasi ekstra, dan filter item kosong.
            return value
              .split(",")
              .map((item) => item.trim()) // Hapus spasi di awal/akhir
              .filter((item) => item); // Hapus item kosong
          }
        }
        return []; // Kembalikan array kosong jika tipe tidak dikenali
      };

      const parsedCapacity = parseInt(capacity, 10);
      if (isNaN(parsedCapacity)) {
        return res
          .status(400)
          .json({ message: "Kapasitas harus berupa angka." });
      }
      let parsedLat = null;
      let parsedLng = null;

      // 3. Siapkan data untuk disimpan
      const programData = {
        program_name: name,
        description: description,
        start_program_date: new Date(startDateProgram),
        end_program_date: new Date(endDateProgram),
        start_regis_date: new Date(startRegisDate),
        end_regis_date: new Date(endRegisDate),
        capacity: parsedCapacity,
        program_status: "open", // Default status saat dibuat
        id_campus: parseInt(idCampus),
        id_major: major.id,
        path_gambar: req.file.path.replace(/\\/g, "/"), // Simpan path dan normalisasi slash
        benefit: parseJsonOrWrapInArray(benefits),
        terms_and_conditions: parseJsonOrWrapInArray(terms),
        type_sesi: programType,
        sesi_start: new Date(`1970-01-01T${startTime}:00`), // Simpan hanya waktu
        sesi_end: new Date(`1970-01-01T${endTime}:00`),
        visibility: visibility,
        create_at: new Date(),
        update_at: new Date(),
      };

      // Tambahkan data lokasi jika program 'onsite'
      if (programType === "onsite") {
        // Lakukan parsing dan validasi di dalam blok ini
        parsedLat = parseFloat(mapLat);
        parsedLng = parseFloat(mapLng);

        // Validasi bahwa semua field lokasi ada dan valid untuk program onsite
        if (!location_name || isNaN(parsedLat) || isNaN(parsedLng)) {
          return res.status(400).json({
            message:
              "Untuk program onsite, nama lokasi, latitude, dan longitude wajib diisi dengan benar.",
          });
        }

        // Tambahkan semua data lokasi ke programData
        programData.onsiteLocationName = location_name;
        programData.lat = parsedLat;
        programData.lng = parsedLng;
      }

      // 4. Buat program baru di database
      const newProgram = await prisma.program.create({
        data: programData,
      });

      return res.status(201).json({
        message: "Program berhasil dibuat.",
        data: newProgram,
      });
    } catch (error) {
      {
        // Hapus file yang sudah diupload jika terjadi error
        if (req.file) {
          fs.unlink(req.file.path, (err) => {
            if (err) console.error("Gagal menghapus file setelah error:", err);
          });
        }

        console.error("Gagal membuat program:", error);
        if (error instanceof SyntaxError) {
          return res.status(400).json({
            message: "Format JSON pada 'benefits' atau 'terms' tidak valid.",
          });
        }
        return res.status(500).json({
          message: "Terjadi kesalahan server saat membuat program.",
          error: error.message,
        });
      }
    }
  }
);

// =======================================================================
// 9. EDIT PROGRAM BY ID
// =======================================================================
router.put(
  "/edit-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadProgramImage.single("bannerImage"), // Middleware untuk handle upload gambar
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const idProgram = parseInt(id, 10);

    if (isNaN(idProgram)) {
      return res
        .status(400)
        .json({ message: "ID Program tidak valid. Harus berupa angka." });
    }

    const {
      name,
      majorName, // Ini adalah ID jurusan
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits,
      terms,
      onsiteLocationName,
      mapLat,
      mapLng,
    } = req.body;

    try {
      // 1. Cari program yang akan di-edit untuk verifikasi dan mendapatkan path gambar lama
      const existingProgram = await prisma.program.findFirst({
        where: {
          id: idProgram,
          id_campus: idCampus, // Pastikan program milik kampus yang sedang login
        },
      });

      if (!existingProgram) {
        return res.status(404).json({
          message:
            "Program tidak ditemukan atau Anda tidak berhak mengeditnya.",
        });
      }

      // 2. Validasi Major ID baru (jika diubah)
      const majorId = parseInt(majorName, 10);
      if (isNaN(majorId)) {
        return res
          .status(400)
          .json({ message: "Format ID Jurusan tidak valid." });
      }

      const major = await prisma.major.findFirst({
        where: { id: majorId, id_campus: idCampus },
      });

      if (!major) {
        return res.status(404).json({
          message: `Jurusan dengan ID '${majorId}' tidak ditemukan atau bukan milik kampus Anda.`,
        });
      }

      // Helper untuk menangani field yang bisa berupa string atau array dari FormData
      const processMultiPartArray = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map((item) => item.trim());
        return [field.trim()];
      };

      // 3. Siapkan data yang akan di-update
      const dataToUpdate = {
        program_name: name,
        id_major: majorId,
        type_sesi: programType,
        visibility: visibility,
        start_regis_date: new Date(startRegisDate),
        end_regis_date: new Date(endRegisDate),
        start_program_date: new Date(startDateProgram),
        end_program_date: new Date(endDateProgram),
        sesi_start: new Date(`1970-01-01T${startTime}:00`),
        sesi_end: new Date(`1970-01-01T${endTime}:00`),
        capacity: parseInt(capacity, 10),
        description: description,
        benefit: processMultiPartArray(benefits),
        terms_and_conditions: processMultiPartArray(terms),
        update_at: new Date(),
      };

      // 4. Handle upload gambar baru (jika ada)
      if (req.file) {
        // Hapus gambar lama jika ada
        if (existingProgram.path_gambar) {
          const oldImagePath = path.join(
            process.cwd(),
            existingProgram.path_gambar
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (err) => {
              if (err)
                console.error(
                  "Gagal menghapus gambar lama:",
                  oldImagePath,
                  err
                );
              else console.log("Gambar lama berhasil dihapus:", oldImagePath);
            });
          }
        }
        // Tambahkan path gambar baru ke data yang akan di-update
        dataToUpdate.path_gambar = req.file.path.replace(/\\/g, "/");
      }

      // 5. Handle data kondisional untuk program 'onsite'
      if (programType === "onsite") {
        const parsedLat = parseFloat(mapLat);
        const parsedLng = parseFloat(mapLng);

        if (!onsiteLocationName || isNaN(parsedLat) || isNaN(parsedLng)) {
          return res.status(400).json({
            message:
              "Untuk program onsite, nama lokasi, latitude, dan longitude wajib diisi.",
          });
        }
        dataToUpdate.onsiteLocationName = onsiteLocationName;
        dataToUpdate.lat = parsedLat;
        dataToUpdate.lng = parsedLng;
      } else {
        // Jika tipe program diubah dari onsite ke online, hapus data lokasi
        dataToUpdate.onsiteLocationName = null;
        dataToUpdate.lat = null;
        dataToUpdate.lng = null;
      }

      // 6. Lakukan update di database
      const updatedProgram = await prisma.program.update({
        where: { id: idProgram },
        data: dataToUpdate,
      });

      return res.status(200).json({
        message: "Program berhasil diperbarui.",
        data: updatedProgram,
      });
    } catch (error) {
      // Jika terjadi error setelah file diunggah, hapus file tersebut
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err)
            console.error(
              "Gagal menghapus file yang baru diunggah setelah error:",
              err
            );
        });
      }

      console.error("Gagal mengedit program:", error);
      if (error.code === "P2025") {
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengedit program.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 8. DELETE PROGRAM BY ID
// =======================================================================
router.delete(
  "/delete-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const idProgram = parseInt(id);

    // Validasi ID program
    if (isNaN(idProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    try {
      // 1. Cari program untuk verifikasi kepemilikan dan mendapatkan path gambar
      const programToDelete = await prisma.program.findFirst({
        where: {
          id: idProgram,
          id_campus: idCampus, // Pastikan program milik kampus yang login
        },
        select: {
          path_gambar: true,
        },
      });

      // Jika program tidak ditemukan atau bukan milik kampus ini
      if (!programToDelete) {
        return res.status(404).json({
          message:
            "Program tidak ditemukan atau Anda tidak berhak menghapusnya.",
        });
      }

      // 2. Hapus file gambar jika ada
      if (programToDelete.path_gambar) {
        // process.cwd() akan mengarah ke root proyek: /home/apipi/Pbl Sem-5/TEMPA-BE
        const imagePath = path.join(process.cwd(), programToDelete.path_gambar);

        // Cek apakah file ada sebelum mencoba menghapus
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, (err) => {
            if (err) {
              // Log error jika gagal menghapus file, tapi lanjutkan proses
              console.error(`Gagal menghapus file gambar: ${imagePath}`, err);
            } else {
              console.log(`File gambar berhasil dihapus: ${imagePath}`);
            }
          });
        }
      }

      // 3. Hapus program dari database
      await prisma.program.delete({
        where: {
          id: idProgram,
        },
      });

      return res.status(200).json({
        message: `Program dengan ID ${idProgram} berhasil dihapus.`,
      });
    } catch (error) {
      console.error("Gagal menghapus program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus program.",
        error: error.message,
      });
    }
  }
);

// get major campus
router.get(
  "/all-majors",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const allMajors = await prisma.major.findMany({
        where: {
          id_campus: idCampus,
        },
        include: {
          standard_major: true,
        },
      });

      if (!allMajors) {
        return res.status(404).json({ message: "Data Jurusan tidak ada." });
      }

      console.log(allMajors);

      return res.status(200).json({
        message: "Data Jurusan ditemukan",
        data: allMajors,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: "Not Found due to internal error." });
    }
  }
);

// =======================================================================
// 10. GET CAMPUS DETAIL FOR LOGGED IN CAMPUS
// =======================================================================
router.get(
  "/detail-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const campusDetail = await prisma.campus.findUnique({
        where: {
          id: idCampus,
        },
        select: {
          id: true,
          campus_name: true,
          email: true, // Email login google
          email_campus: true, // Email resmi kampus
          path_logo: true,
          path_banner: true,
          address: true,
          description: true,
          vision_mission: true,
          website_campus: true,
          province: true,
          city: true,
          subdistrict: true,
          ward: true,
          lat: true,
          lng: true,
          major: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      console.log(campusDetail);

      if (!campusDetail) {
        return res
          .status(404)
          .json({ message: "Data kampus tidak ditemukan." });
      }

      // Format URL untuk gambar
      const formattedData = { ...campusDetail };
      formattedData.logo_url = formatPathToUrl(
        formattedData.path_logo,
        BASE_URL
      );
      formattedData.banner_url = formatPathToUrl(
        formattedData.path_banner,
        BASE_URL
      );
      delete formattedData.path_logo;
      delete formattedData.path_banner;

      return res.status(200).json({
        message: "Detail kampus berhasil diambil.",
        data: formattedData,
      });
    } catch (error) {
      console.error("Gagal mengambil detail kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan pada server.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// MULTER CONFIG FOR CAMPUS IMAGES (LOGO & BANNER)
// =======================================================================
const campusImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // file.fieldname akan menjadi 'logo' atau 'banner'
    const dir = `uploads/campus_images/${file.fieldname}`; // hasil: uploads/campus_images/logo atau uploads/campus_images/banner
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `campus-${file.fieldname}-` +
        uniqueSuffix +
        path.extname(file.originalname)
    );
  },
});

const uploadCampusImages = multer({
  storage: campusImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!"));
  },
});

// =======================================================================
// 12. EDIT CAMPUS LOGO & BANNER
// =======================================================================
router.put(
  "/edit-image-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadCampusImages.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { campus_name } = req.body;
    // console.log(req.body);

    // Cek apakah ada file yang diunggah atau nama kampus yang dikirim
    if ((!req.files || Object.keys(req.files).length === 0) && !campus_name) {
      return res
        .status(400)
        .json({ message: "Tidak ada data yang dikirim untuk diperbarui." });
    }

    try {
      // 1. Ambil data kampus saat ini untuk mendapatkan path gambar lama
      const currentCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
        select: { path_logo: true, path_banner: true },
      });

      if (!currentCampus) {
        return res.status(404).json({ message: "Kampus tidak ditemukan." });
      }

      const dataToUpdate = {};

      // Fungsi untuk menghapus file lama
      const deleteOldFile = (filePath) => {
        if (filePath) {
          const fullPath = path.join(process.cwd(), filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlink(fullPath, (err) => {
              if (err)
                console.error(`Gagal menghapus file lama: ${fullPath}`, err);
              else console.log(`File lama berhasil dihapus: ${fullPath}`);
            });
          }
        }
      };

      // 2. Proses file logo jika ada
      if (req.files && req.files.logo) {
        const newLogoPath = req.files.logo[0].path.replace(/\\/g, "/");
        dataToUpdate.path_logo = newLogoPath;
        deleteOldFile(currentCampus.path_logo);
      }

      // 3. Proses file banner jika ada
      if (req.files && req.files.banner) {
        const newBannerPath = req.files.banner[0].path.replace(/\\/g, "/");
        dataToUpdate.path_banner = newBannerPath;
        deleteOldFile(currentCampus.path_banner);
      }

      if (campus_name) {
        dataToUpdate.campus_name = campus_name;
      }

      // 4. Update database dengan path baru jika ada data yang diupdate
      if (Object.keys(dataToUpdate).length > 0) {
        const updatedCampus = await prisma.campus.update({
          where: { id: idCampus },
          data: dataToUpdate,
        });

        return res.status(200).json({
          message: "Gambar kampus berhasil diperbarui.",
          data: updatedCampus,
        });
      } else {
        return res
          .status(400)
          .json({ message: "Tidak ada data gambar untuk diperbarui." });
      }
    } catch (error) {
      // Jika terjadi error, hapus file yang baru saja diunggah
      if (req.files) {
        if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
        if (req.files.banner) fs.unlinkSync(req.files.banner[0].path);
      }

      console.error("Gagal mengedit gambar kampus:", error);
      if (error.code === "P2025") {
        return res
          .status(404)
          .json({ message: "Gagal memperbarui, kampus tidak ditemukan." });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui gambar.",
        error: error.message,
      });
    }
  }
);

// =======================================================================
// 13. EDIT CAMPUS DESCRIPTION & VISION/MISSION
// =======================================================================
router.put(
  "/edit-description-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { description, vision_mission } = req.body;

    // Cek apakah ada data yang dikirim untuk diperbarui
    if (description === undefined && vision_mission === undefined) {
      return res
        .status(400)
        .json({ message: "Tidak ada data yang dikirim untuk diperbarui." });
    }

    try {
      const dataToUpdate = {};

      if (description !== undefined) {
        dataToUpdate.description = description;
      }

      if (vision_mission !== undefined) {
        // Prisma mengharapkan objek/array untuk tipe data JSON.
        // Jika frontend mengirim string, kita perlu parse.
        let parsedVisionMission = vision_mission;
        if (typeof vision_mission === "string") {
          try {
            parsedVisionMission = JSON.parse(vision_mission);
          } catch (e) {
            return res
              .status(400)
              .json({
                message:
                  "Format vision_mission tidak valid (harus berupa JSON).",
              });
          }
        }
        dataToUpdate.vision_mission = parsedVisionMission;
      }

      const updatedCampus = await prisma.campus.update({
        where: { id: idCampus },
        data: dataToUpdate,
      });

      return res.status(200).json({
        message: "Deskripsi dan visi misi kampus berhasil diperbarui.",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal mengedit deskripsi kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui data.",
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
