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
import fs from "fs";
import formatPathToUrl from "../controllers/formatPathUrl.js"; // Helper untuk format URL gambar
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import mailQueue from "../lib/mailQueue.js";
import * as campusController from "../controllers/campusController.js";

const router = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// root proyek (TEMPA-BE)
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Path to Interpreter Python VENV (Windows)
// const PYTHON_VENV_PATH = path.join(
//   PROJECT_ROOT,
//   "venv_pddikti",
//   "Scripts",
//   "python.exe"
// );

// uncomment if your system is linux or macos
const PYTHON_VENV_PATH = path.join(
  PROJECT_ROOT,
  "venv_pddikti",
  "bin",
  "python3",
);

// Path Script Python
const PYTHON_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "controllers",
  "dataCampus.py",
);

// Path Script Python untuk Mentor
const PYTHON_MENTOR_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "controllers",
  "dataMentor.py",
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
      path.extname(file.originalname).toLowerCase(),
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
// MULTER CONFIG FOR MATERI FILES
// =======================================================================
const materiFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(PROJECT_ROOT, "uploads/program_materi");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const dir = path.join(PROJECT_ROOT, "uploads/program_materi");
    // Ganti spasi dengan (-) agar semua karakter menyambung
    let fileName = file.originalname.replace(/\s+/g, "-");
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let counter = 1;

    while (fs.existsSync(path.join(dir, fileName))) {
      fileName = `${baseName}_${counter}${ext}`;
      counter++;
    }
    cb(null, fileName);
  },
});

const uploadMateriFiles = multer({
  storage: materiFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
});

const normalizeResourcePath = (inputPath) => {
  if (!inputPath) return "";

  // Hilangkan URL domain jika ada
  inputPath = inputPath.replace(/^https?:\/\/[^/]+\/public\//, "");

  // Ambil path setelah program_materi/
  const parts = inputPath.split("program_materi/");
  if (parts.length < 2) return "";

  return `program_materi/${parts[1]}`;
};

// oauth login
router.post("/login-campus", campusController.loginCampus);

// register mitra campus (update data)
router.post(
  "/register-mitra-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.registerCampus,
);

// edit data campus
router.put(
  "/edit-data-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.editDataCampus,
);

// check verification campus
router.get(
  "/check-verification-status",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.checkVerificationCampus,
);

// get detail verification campus (For Edit Form)
router.get(
  "/get-detail-verification-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.getDetailVerificationCampus,
);

// get all program by campus id
router.get(
  "/get-program-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.getAllProgramByCampusId,
);

// get detail program by id program
router.get(
  "/get-detail-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.getDetailProgram,
);

// get all mentee where registered program by id
router.get(
  "/get-detail-program-total-mentee/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.getAllMenteeWhereRegisteredProgram,
);

// get program feedback
router.get(
  "/get-program-feedback/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.getProgramFeedback,
);

// get campus name for validation (use api from python)
router.get("/validate-campus/:campusName", campusController.getNameCampus);

// =======================================================================
// 7.1. GET DATA MENTOR FOR VALIDATION (Menggunakan Python)
// =======================================================================
router.get("/validate-mentor/:nik", (req, res) => {
  const { nik } = req.params;

  if (!nik) {
    return res
      .status(400)
      .json({ status: "error", message: 'Parameter "nik" diperlukan.' });
  }

  // Gunakan spawn untuk menjalankan proses Python
  const pythonProcess = spawn(PYTHON_VENV_PATH, [
    PYTHON_MENTOR_SCRIPT_PATH,
    nik, // Argumen NIK untuk Python
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
        `Python script (mentor) exited with code ${code}. Stderr: ${errorData}`,
      );
      try {
        const errorResult = JSON.parse(outputData);
        if (errorResult.status === "error") {
          return res.status(500).json(errorResult);
        }
      } catch (e) {
        return res.status(500).json({
          status: "error",
          message: "Gagal menjalankan validasi mentor (Internal Server Error).",
        });
      }
    }

    try {
      const result = JSON.parse(outputData);
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
  campusController.getProgramCampusDataChart,
);

// create program campus
router.post(
  "/create-program",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadProgramImage.single("bannerImage"),
  campusController.createProgram,
);

// edit program
router.put(
  "/edit-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadProgramImage.single("bannerImage"),
  campusController.updateProgram,
);

// delete program
router.delete(
  "/delete-program/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  campusController.deleteProgram,
);

// get major for form major
router.get(
  "/all-majors-form",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const allMajors = await prisma.standard_major.findMany({
        select: {
          id: true,
          major_name: true,
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
  },
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
  },
);

// =======================================================================
// GET ALL MENTORS BY CAMPUS ID
// =======================================================================
router.get(
  "/all-mentors",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const allMentors = await prisma.mentor.findMany({
        where: {
          id_campus: idCampus,
        },
        select: {
          id: true,
          name: true,
          nik: true,
          mentor_type: true,
        },
      });

      if (!allMentors || allMentors.length === 0) {
        return res.status(404).json({ message: "Data Mentor tidak ada." });
      }

      return res.status(200).json({
        message: "Data Mentor ditemukan",
        data: allMentors,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: "Terjadi kesalahan internal pada server." });
    }
  },
);

// =======================================================================
// CREATE NEW MENTOR BY CAMPUS
// =======================================================================
router.post(
  "/create-mentor",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { name, nik, password, mentor_type } = req.body;

    // 1. Validasi input dasar
    if (!name || !nik || !password || !mentor_type) {
      return res.status(400).json({
        message:
          "Gagal: Field 'name', 'nik', 'password', dan 'mentor_type' wajib diisi.",
      });
    }

    const parsedNik = parseInt(nik, 10);

    if (isNaN(parsedNik)) {
      return res.status(400).json({
        message: "Gagal: 'nik' dan 'id_major' harus berupa angka yang valid.",
      });
    }

    try {
      // 3. Enkripsi password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // 4. Buat mentor baru di database
      const newMentor = await prisma.mentor.create({
        data: {
          name: name,
          nik: parsedNik,
          id_campus: idCampus,
          password: hashedPassword,
          mentor_type: mentor_type,
        },
      });

      // Hapus password dari objek respons untuk keamanan
      delete newMentor.password;

      return res.status(201).json({
        message: "Mentor baru berhasil dibuat.",
        data: newMentor,
      });
    } catch (error) {
      console.error("Gagal membuat mentor:", error);

      // Penanganan error jika NIK sudah ada (unique constraint)
      if (error.code === "P2002" && error.meta?.target?.includes("nik")) {
        return res.status(409).json({
          message: `Gagal: NIK '${nik}' sudah terdaftar.`,
        });
      }

      return res.status(500).json({
        message: "Terjadi kesalahan internal pada server saat membuat mentor.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// EDIT MENTOR BY ID
// =======================================================================
router.put(
  "/edit-mentor/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const mentorId = parseInt(id, 10);

    // 1. Validasi ID mentor dari parameter
    if (isNaN(mentorId)) {
      return res
        .status(400)
        .json({ message: "ID Mentor tidak valid. Harus berupa angka." });
    }

    const { name, nik, password, mentor_type } = req.body;

    // Cek jika tidak ada data yang dikirim
    if (!name && !nik && !password && !mentor_type) {
      return res
        .status(400)
        .json({ message: "Tidak ada data yang dikirim untuk diperbarui." });
    }

    try {
      // 2. Verifikasi bahwa mentor ada dan milik kampus yang login
      const existingMentor = await prisma.mentor.findFirst({
        where: {
          id: mentorId,
          id_campus: idCampus,
        },
      });

      if (!existingMentor) {
        return res.status(404).json({
          message: "Mentor tidak ditemukan atau Anda tidak berhak mengeditnya.",
        });
      }

      // 3. Siapkan data yang akan di-update
      const dataToUpdate = {};

      if (name) dataToUpdate.name = name;
      if (mentor_type) dataToUpdate.mentor_type = mentor_type;

      if (nik) {
        const parsedNik = parseInt(nik, 10);
        if (isNaN(parsedNik)) {
          return res
            .status(400)
            .json({ message: "Gagal: 'nik' harus berupa angka yang valid." });
        }
        dataToUpdate.nik = parsedNik;
      }

      // Enkripsi password baru jika ada
      if (password) {
        const saltRounds = 10;
        dataToUpdate.password = await bcrypt.hash(password, saltRounds);
      }

      // 4. Lakukan update di database
      const updatedMentor = await prisma.mentor.update({
        where: { id: mentorId },
        data: dataToUpdate,
      });

      // Hapus password dari objek respons
      delete updatedMentor.password;

      return res.status(200).json({
        message: "Data mentor berhasil diperbarui.",
        data: updatedMentor,
      });
    } catch (error) {
      console.error("Gagal mengedit mentor:", error);
      if (error.code === "P2002" && error.meta?.target?.includes("nik")) {
        return res.status(409).json({
          message: `Gagal: NIK '${nik}' sudah terdaftar.`,
        });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengedit mentor.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// DELETE MENTOR BY ID
// =======================================================================
router.delete(
  "/delete-mentor/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const mentorId = parseInt(id, 10);

    // 1. Validasi ID mentor
    if (isNaN(mentorId)) {
      return res
        .status(400)
        .json({ message: "ID Mentor tidak valid. Harus berupa angka." });
    }

    try {
      // 2. Verifikasi bahwa mentor ada dan milik kampus yang login
      const mentorToDelete = await prisma.mentor.findFirst({
        where: {
          id: mentorId,
          id_campus: idCampus,
        },
        include: {
          // Sertakan relasi untuk pemeriksaan
          _count: {
            select: { program_mentor: true },
          },
        },
      });

      // Jika mentor tidak ditemukan atau bukan milik kampus ini
      if (!mentorToDelete) {
        return res.status(404).json({
          message:
            "Mentor tidak ditemukan atau Anda tidak berhak menghapusnya.",
        });
      }

      // 3. Cek relasi ke program_mentor sebelum menghapus
      if (mentorToDelete._count.program_mentor > 0) {
        return res.status(409).json({
          message: `Gagal menghapus: Mentor ini masih terdaftar di ${mentorToDelete._count.program_mentor} program. Harap hapus dari program terlebih dahulu.`,
        });
      }

      // 4. Hapus mentor dari database
      await prisma.mentor.delete({
        where: {
          id: mentorId,
        },
      });

      return res.status(200).json({
        message: `Mentor dengan ID ${mentorId} berhasil dihapus.`,
      });
    } catch (error) {
      console.error("Gagal menghapus mentor:", error);

      // Penanganan error spesifik dari Prisma jika record tidak ditemukan saat delete
      if (error.code === "P2025") {
        return res.status(404).json({
          message:
            "Gagal menghapus: Mentor tidak ditemukan (mungkin sudah dihapus).",
        });
      }

      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus mentor.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// UPDATE PROGRAM MENTORS (Bulk Assign/Edit)
// =======================================================================
router.post(
  "/update-program-mentors/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const idProgram = parseInt(id, 10);
    const mentorsData = req.body; // Expecting: [{id: 1, ...}, {id: 3, ...}]

    // 1. Validasi Input
    if (isNaN(idProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    if (!Array.isArray(mentorsData)) {
      return res.status(400).json({
        message: "Format data salah. Harus berupa array objek mentor.",
      });
    }

    try {
      // 2. Verifikasi program milik kampus
      const programCheck = await prisma.program.findFirst({
        where: {
          id: idProgram,
          id_campus: idCampus,
        },
      });

      if (!programCheck) {
        return res.status(404).json({
          message: "Program tidak ditemukan atau bukan milik kampus Anda.",
        });
      }

      // 3. Ekstrak ID Mentor dan filter yang valid
      const newMentorIds = mentorsData
        .map((m) => parseInt(m.id))
        .filter((id) => !isNaN(id));

      // Hapus duplikat ID dari input
      const uniqueNewMentorIds = [...new Set(newMentorIds)];

      // 4. Ambil ID mentor yang sudah ada di database untuk program ini
      const existingProgramMentors = await prisma.program_mentor.findMany({
        where: {
          id_program: idProgram,
        },
        select: {
          id_mentor: true,
        },
      });

      const existingMentorIds = existingProgramMentors.map(
        (pm) => pm.id_mentor,
      );

      // 5. Tentukan ID yang perlu dihapus dan ditambahkan
      const idsToDelete = existingMentorIds.filter(
        (id) => !uniqueNewMentorIds.includes(id),
      );

      const idsToAdd = uniqueNewMentorIds.filter(
        (id) => !existingMentorIds.includes(id),
      );

      // 6. Transaksi Database
      await prisma.$transaction(async (tx) => {
        // a. Hapus mentor yang tidak ada di list baru
        if (idsToDelete.length > 0) {
          await tx.program_mentor.deleteMany({
            where: {
              id_program: idProgram,
              id_mentor: {
                in: idsToDelete,
              },
            },
          });
        }

        // b. Tambahkan mentor baru
        if (idsToAdd.length > 0) {
          const dataToInsert = idsToAdd.map((mentorId) => ({
            id_program: idProgram,
            id_mentor: mentorId,
          }));

          await tx.program_mentor.createMany({
            data: dataToInsert,
          });
        }
      });

      return res.status(200).json({
        message: "Daftar mentor program berhasil diperbarui.",
        details: {
          added: idsToAdd.length,
          deleted: idsToDelete.length,
        },
      });
    } catch (error) {
      console.error("Gagal update mentor program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui data mentor.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// 11. ADD MAJORS TO CAMPUS
// =======================================================================
router.post(
  "/add-majors-campus",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const newMajorsFromRequest = req.body;

    // 1. Validasi input
    if (!Array.isArray(newMajorsFromRequest)) {
      return res.status(400).json({
        message:
          "Input tidak valid. Diperlukan sebuah array berisi objek jurusan (major).",
      });
    }

    try {
      // Ekstrak ID jurusan standar dari request dan pastikan unik
      const newStandardMajorIds = new Set(
        newMajorsFromRequest
          .map((major) => major.id)
          .filter((id) => typeof id === "number"),
      );

      // Ambil semua jurusan yang saat ini terdaftar untuk kampus ini
      const existingMajors = await prisma.major.findMany({
        where: { id_campus: idCampus },
        select: { id_standard_major: true },
      });
      const existingStandardMajorIds = new Set(
        existingMajors.map((major) => major.id_standard_major),
      );

      // Tentukan jurusan mana yang akan ditambahkan dan dihapus
      const idsToAdd = [...newStandardMajorIds].filter(
        (id) => !existingStandardMajorIds.has(id),
      );
      const idsToRemove = [...existingStandardMajorIds].filter(
        (id) => !newStandardMajorIds.has(id),
      );

      // Gunakan transaksi untuk memastikan semua operasi berhasil atau tidak sama sekali
      const transactionResult = await prisma.$transaction(async (tx) => {
        // Hapus jurusan yang tidak lagi ada di daftar
        if (idsToRemove.length > 0) {
          await tx.major.deleteMany({
            where: {
              id_campus: idCampus,
              id_standard_major: { in: idsToRemove },
            },
          });
        }

        // Tambahkan jurusan baru
        if (idsToAdd.length > 0) {
          await tx.major.createMany({
            data: idsToAdd.map((id) => ({
              id_campus: idCampus,
              id_standard_major: id,
            })),
          });
        }

        return { added: idsToAdd.length, removed: idsToRemove.length };
      });

      return res.status(200).json({
        message: `Sinkronisasi jurusan berhasil. Ditambahkan: ${transactionResult.added}, Dihapus: ${transactionResult.removed}.`,
        data: {
          id_campus: idCampus,
          synced_majors: [...newStandardMajorIds],
        },
      });
    } catch (error) {
      console.error("Gagal menambahkan jurusan ke kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menambahkan jurusan.",
        error: error.message,
      });
    }
  },
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
      const checkSubscription = await prisma.campus_subscription.findFirst({
        where: {
          id_campus: idCampus,
          id_package: {
            in: [1, 2],
          },
          expired_date: {
            gte: new Date(),
          },
        },
      });

      // Update badge status: true jika paket 2 aktif, false jika paket 1 atau tidak aktif
      await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          badge: checkSubscription?.id_package === 2,
        },
      });

      const campusDetail = await prisma.campus.findUnique({
        where: {
          id: idCampus,
        },
        select: {
          id: true,
          campus_name: true,
          email: true,
          email_campus: true,
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
          badge: true,
          seen: true,
          major: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      // console.log(campusDetail);

      if (!campusDetail) {
        return res
          .status(404)
          .json({ message: "Data kampus tidak ditemukan." });
      }

      // Format URL untuk gambar
      const formattedData = { ...campusDetail };
      if (!checkSubscription) {
        formattedData.seen = false;
      }

      formattedData.logo_url = formatPathToUrl(
        formattedData.path_logo,
        BASE_URL,
      );
      formattedData.banner_url = formatPathToUrl(
        formattedData.path_banner,
        BASE_URL,
      );
      delete formattedData.path_logo;
      delete formattedData.path_banner;

      // console.log(formattedData);
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
  },
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
        path.extname(file.originalname),
    );
  },
});

const uploadCampusImages = multer({
  storage: campusImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase(),
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
  },
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
            return res.status(400).json({
              message: "Format vision_mission tidak valid (harus berupa JSON).",
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
  },
);

// =======================================================================
// UPDATE CAMPUS LOCATION
// =======================================================================
router.put(
  "/update-location",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const { idCampus, province, city, subdistrict, ward, lat, lng } = req.body;
    const senderId = req.user.id;

    // Validasi idCampus jika ada di body
    if (idCampus && parseInt(idCampus) !== senderId) {
      return res.status(403).json({
        message: "Anda tidak diizinkan mengupdate data kampus lain.",
      });
    }

    if (
      !province ||
      !city ||
      !subdistrict ||
      !ward ||
      lat === undefined ||
      lng === undefined
    ) {
      return res.status(400).json({
        message:
          "Field province, city, subdistrict, ward, lat, dan lng wajib diisi.",
      });
    }

    try {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        return res.status(400).json({
          message: "Latitude dan Longitude harus berupa angka valid.",
        });
      }

      const updatedCampus = await prisma.campus.update({
        where: {
          id: senderId,
        },
        data: {
          province: province,
          city: city,
          subdistrict: subdistrict,
          ward: ward,
          lat: parsedLat,
          lng: parsedLng,
        },
      });

      return res.status(200).json({
        message: "Data lokasi kampus berhasil diperbarui.",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal update lokasi kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui lokasi.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// DELETE MENTOR FROM PROGRAM (Unassign Mentor)
// =======================================================================
router.delete(
  "/delete-program-mentor/:id",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { id } = req.params;
    const idProgramMentor = parseInt(id, 10);

    // 1. Validasi ID
    if (isNaN(idProgramMentor)) {
      return res.status(400).json({
        message: "ID Program Mentor tidak valid. Harus berupa angka.",
      });
    }

    try {
      // 2. Cari data program_mentor beserta info programnya untuk verifikasi
      const targetData = await prisma.program_mentor.findUnique({
        where: {
          id: idProgramMentor,
        },
        include: {
          program: {
            select: {
              id_campus: true,
            },
          },
        },
      });

      // 3. Cek apakah data ditemukan
      if (!targetData) {
        console.log("Data mentor pada program ini tidak ditemukan.");
        return res.status(404).json({
          message: "Data mentor pada program ini tidak ditemukan.",
        });
      }

      // 4. Verifikasi kepemilikan (Authorization)
      // Pastikan program terkait milik kampus yang sedang login
      if (targetData.program.id_campus !== idCampus) {
        return res.status(403).json({
          message:
            "Anda tidak memiliki izin untuk menghapus mentor dari program ini.",
        });
      }

      // 5. Hapus data
      await prisma.program_mentor.delete({
        where: {
          id: idProgramMentor,
        },
      });

      return res.status(200).json({
        message: "Mentor berhasil dihapus dari program.",
      });
    } catch (error) {
      console.error("Gagal menghapus mentor dari program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus data.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// ADD MATERI TO PROGRAM
// =======================================================================
router.post(
  "/add-materi/:idProgram",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadMateriFiles.single("file"), // Mengubah menjadi single file upload dengan field 'file'
  async (req, res) => {
    const idCampus = req.user.id;
    const { idProgram } = req.params;
    const { title, description, visibility, type, url } = req.body;

    const idProgramInt = parseInt(idProgram, 10);

    // Validasi ID Program
    if (isNaN(idProgramInt)) {
      return res.status(400).json({ message: "ID Program tidak valid." });
    }

    // Validasi Input Wajib
    if (!title || !description) {
      // Hapus file yang sudah terlanjur diupload jika validasi gagal
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
      return res.status(400).json({
        message:
          "Judul (title) dan deskripsi (description) materi wajib diisi.",
      });
    }

    try {
      // 1. Verifikasi Kepemilikan Program
      const program = await prisma.program.findFirst({
        where: {
          id: idProgramInt,
          id_campus: idCampus,
        },
      });

      if (!program) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          message: "Program tidak ditemukan atau bukan milik kampus Anda.",
        });
      }

      // 2. Siapkan Data Resource (File)
      let resourcePath = "";

      if (type === "file") {
        if (!req.file) {
          return res.status(400).json({
            message: "File wajib diunggah untuk tipe materi 'file'.",
          });
        }
        resourcePath = `uploads/program_materi/${req.file.filename}`;
      } else if (type === "kuis" || type === "video") {
        if (!url) {
          if (req.file && fs.existsSync(req.file.path))
            fs.unlinkSync(req.file.path);
          return res.status(400).json({
            message: `URL wajib diisi untuk tipe materi '${type}'.`,
          });
        }
        resourcePath = url;
        // Jika user tidak sengaja upload file tapi pilih type kuis/video, hapus filenya
        if (req.file && fs.existsSync(req.file.path))
          fs.unlinkSync(req.file.path);
      } else {
        if (req.file && fs.existsSync(req.file.path))
          fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message:
            "Tipe materi tidak valid. Gunakan 'file', 'kuis', atau 'video'.",
        });
      }

      // 3. Simpan Materi dan Resource ke Database
      const newMateri = await prisma.materi.create({
        data: {
          title: title,
          description: description,
          visibility: visibility || "public", // Default public
          id_program: idProgramInt,
          create_at: new Date(),
          update_at: new Date(),
          materi_resource: {
            create: [
              {
                type: type,
                path_file: resourcePath,
              },
            ],
          },
        },
        include: {
          materi_resource: true,
        },
      });

      return res.status(201).json({
        message: "Materi berhasil ditambahkan ke program.",
        data: newMateri,
      });
    } catch (error) {
      // Hapus file jika terjadi error database
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Gagal menambahkan materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menambahkan materi.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// EDIT MATERI AND ADD RESOURCES
// =======================================================================
router.put(
  "/edit-materi/:idMateri",
  authenticateUser,
  authorizeRoles(["campus"]),
  uploadMateriFiles.any(),
  async (req, res) => {
    const idCampus = req.user.id;
    const { idMateri } = req.params;
    const { title, description, visibility } = req.body;

    const idMateriInt = parseInt(idMateri, 10);

    // console.log("=========================================");
    // console.log("REQ.BODY (Field Teks/Data):", req.body);
    // console.log("REQ.FILES (File Upload):", req.files);
    // console.log("=========================================");

    // Helper untuk menghapus file jika terjadi error
    const cleanupFiles = (files) => {
      if (files && Array.isArray(files)) {
        files.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
    };

    if (isNaN(idMateriInt)) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: "ID Materi tidak valid." });
    }

    try {
      // 1. Cari Materi dan Verifikasi Kepemilikan
      const materi = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: {
          program: true,
          materi_resource: true,
        },
      });

      if (!materi) {
        cleanupFiles(req.files);
        return res.status(404).json({ message: "Materi tidak ditemukan." });
      }

      if (materi.program.id_campus !== idCampus) {
        cleanupFiles(req.files);
        return res.status(403).json({
          message: "Anda tidak memiliki akses untuk mengedit materi ini.",
        });
      }

      // 2. Parsing new_resources dari req.body dan req.files
      const newResourcesMap = {};

      // Helper to safely set resource data
      const setResourceData = (index, key, value) => {
        if (!newResourcesMap[index]) newResourcesMap[index] = {};
        newResourcesMap[index][key] = value;
      };

      // Cek jika new_resources sudah berupa array/objek (parsed body)
      if (
        req.body.new_resources &&
        typeof req.body.new_resources === "object"
      ) {
        Object.keys(req.body.new_resources).forEach((index) => {
          const item = req.body.new_resources[index];
          if (item && typeof item === "object") {
            Object.keys(item).forEach((key) => {
              setResourceData(index, key, item[key]);
            });
          }
        });
      }

      // Parse field teks (type, url, dll)
      Object.keys(req.body).forEach((key) => {
        const match = key.match(/^new_resources\[(\d+)\]\[(\w+)\]$/);
        if (match) {
          setResourceData(match[1], match[2], req.body[key]);
        }
      });

      // Map file yang diupload ke index yang sesuai
      if (req.files) {
        req.files.forEach((file) => {
          // Fieldname format: new_resources[0][file]
          const match = file.fieldname.match(
            /^new_resources\[(\d+)\]\[file\]$/,
          );
          if (match) {
            setResourceData(match[1], "file", file);
          }
        });
      }

      const newResources = Object.values(newResourcesMap);
      // Filter resource yang memiliki type ATAU memiliki file (jika type lupa dikirim)
      const validNewResources = newResources.filter(
        (res) => res.type || res.file,
      );
      // console.log("New Resources Parsed:", validNewResources);

      // 3. Kelola Resource Lama (Keep dan Delete)
      // Parsing kept_resource_ids yang lebih robust (handle array dan indexed keys)
      let keptResourceIds = [];

      // Cek format array/single value langsung
      if (req.body.kept_resource_ids) {
        if (Array.isArray(req.body.kept_resource_ids)) {
          keptResourceIds = req.body.kept_resource_ids.map((id) =>
            parseInt(id, 10),
          );
        } else if (typeof req.body.kept_resource_ids === "object") {
          keptResourceIds = Object.values(req.body.kept_resource_ids).map(
            (id) => parseInt(id, 10),
          );
        } else {
          keptResourceIds = [parseInt(req.body.kept_resource_ids, 10)];
        }
      }

      // Cek format indexed keys: kept_resource_ids[0], kept_resource_ids[1]
      Object.keys(req.body).forEach((key) => {
        const match = key.match(/^kept_resource_ids\[(\d+)\]$/);
        if (match) {
          keptResourceIds.push(parseInt(req.body[key], 10));
        }
      });

      // Filter valid integers dan unique
      keptResourceIds = [...new Set(keptResourceIds.filter(Number.isInteger))];

      // 4. Validasi dan Persiapan Data Resource Baru
      const resourcesToCreate = [];

      for (const [idx, resData] of validNewResources.entries()) {
        let type = resData.type ? resData.type.trim().toLowerCase() : "";

        // Jika type kosong tapi ada file, asumsikan tipe 'file'
        if (!type && resData.file) {
          type = "file";
        }

        let resourcePath = "";

        if (type === "file") {
          if (!resData.file) {
            // Cek apakah ini file lama yang dikirim via URL (validasi path)
            let isExistingFile = false;
            if (resData.url) {
              // Ambil bagian path setelah 'program_materi/'
              if (resData.url) {
                const normalizedUrl = normalizeResourcePath(resData.url);

                const existingRes = materi.materi_resource.find(
                  (r) =>
                    r.type === "file" &&
                    normalizeResourcePath(r.path_file) === normalizedUrl,
                );

                if (existingRes) {
                  keptResourceIds.push(existingRes.id);
                  continue;
                }
              }
            }

            if (isExistingFile) continue;

            cleanupFiles(req.files);
            return res.status(400).json({
              message: "File wajib diunggah untuk resource bertipe 'file'.",
            });
          }

          // Gunakan filename dari Multer yang sudah menangani duplikasi nama (auto-rename)
          resourcePath = `uploads/program_materi/${resData.file.filename}`;
        } else if (type === "kuis" || type === "video") {
          const urlValue = resData.url || resData.path_file;

          if (!urlValue) {
            cleanupFiles(req.files);
            return res.status(400).json({
              message: `URL wajib diisi untuk tipe '${type}'.`,
            });
          }
          resourcePath = urlValue;

          // Hapus file jika user tidak sengaja upload file untuk tipe non-file
          if (resData.file && fs.existsSync(resData.file.path)) {
            fs.unlinkSync(resData.file.path);
          }
        } else {
          cleanupFiles(req.files);
          return res.status(400).json({
            message:
              "Tipe resource tidak valid. Gunakan 'file', 'kuis', atau 'video'.",
          });
        }

        resourcesToCreate.push({
          id_materi: idMateriInt, // Tambahkan id_materi untuk createMany
          type: type,
          path_file: resourcePath,
        });
      }

      // Update unique keptResourceIds
      keptResourceIds = [...new Set(keptResourceIds)];

      // ID resource yang saat ini ada di DB
      const existingResourceIds = materi.materi_resource.map((r) => r.id);

      // ID resource yang akan DIHAPUS
      const resourcesToDeleteIds = existingResourceIds.filter(
        (id) => !keptResourceIds.includes(id),
      );

      // Cek Batas Maksimal Resource (Max 3)
      const keptCount = keptResourceIds.length;
      const newCount = resourcesToCreate.length;

      if (keptCount + newCount > 3) {
        cleanupFiles(req.files);
        return res.status(400).json({
          message: `Gagal: Jumlah resource (lama + baru) melebihi batas (Max 3). Resource yang dipertahankan: ${keptCount}, Resource baru: ${newCount}.`,
        });
      }

      // Refactor: Jangan hapus data di database jika file yang sama ditambahkan lagi (Rescue logic)
      const newResourcePaths = resourcesToCreate.map((r) => r.path_file);
      const resourcesToDelete = materi.materi_resource.filter((r) =>
        resourcesToDeleteIds.includes(r.id),
      );

      const idsToRescue = resourcesToDelete
        .filter(
          (r) => r.type === "file" && newResourcePaths.includes(r.path_file),
        )
        .map((r) => r.id);

      const finalResourcesToDeleteIds = resourcesToDeleteIds.filter(
        (id) => !idsToRescue.includes(id),
      );

      // Hapus file fisik untuk resource yang akan dihapus (hanya tipe 'file')
      // Dilakukan setelah validasi resource baru untuk memastikan file tidak sedang digunakan ulang
      if (finalResourcesToDeleteIds.length > 0) {
        const deletedFileResources = materi.materi_resource.filter(
          (r) => r.type === "file" && finalResourcesToDeleteIds.includes(r.id),
        );

        for (const res of deletedFileResources) {
          // Cek apakah file ini digunakan oleh resource lain yang TIDAK dihapus (di DB)
          const isUsedElsewhere = await prisma.materi_resource.findFirst({
            where: {
              path_file: res.path_file,
              id: { notIn: finalResourcesToDeleteIds },
            },
          });

          // Cek apakah file ini digunakan oleh resource yang baru akan dibuat (resourcesToCreate)
          const isReusedInNew = resourcesToCreate.some(
            (newRes) => newRes.path_file === res.path_file,
          );

          if (
            !isUsedElsewhere &&
            !isReusedInNew &&
            fs.existsSync(res.path_file)
          ) {
            fs.unlinkSync(res.path_file);
          }
        }
      }

      // 5. Update Materi menggunakan Transaction (Atomik)
      // Ini menjamin update materi, delete resource, dan create resource berhasil semua
      const transactionQueries = [
        // A. Update Detail Materi
        prisma.materi.update({
          where: { id: idMateriInt },
          data: {
            title: title,
            description: description,
            visibility: visibility,
            update_at: new Date(),
          },
        }),
        // B. Hapus Resource yang Tidak Dipertahankan
        prisma.materi_resource.deleteMany({
          where: {
            id: { in: finalResourcesToDeleteIds },
          },
        }),
      ];
      // C. Buat Resource Baru (jika ada)
      if (resourcesToCreate.length > 0) {
        transactionQueries.push(
          prisma.materi_resource.createMany({
            data: resourcesToCreate,
          }),
        );
      }

      await prisma.$transaction(transactionQueries);

      // Ambil data materi yang sudah diperbarui secara penuh
      const finalMateri = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: { materi_resource: true },
      });

      return res.status(200).json({
        message: "Materi berhasil diperbarui.",
        data: finalMateri,
      });
    } catch (error) {
      cleanupFiles(req.files);
      console.error("Gagal mengedit materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengedit materi.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// DELETE MATERI BY ID
// =======================================================================
router.delete(
  "/delete-materi/:idMateri",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;
    const { idMateri } = req.params;
    const idMateriInt = parseInt(idMateri, 10);

    if (isNaN(idMateriInt)) {
      return res.status(400).json({ message: "ID Materi tidak valid." });
    }

    try {
      // 1. Cari Materi dan Verifikasi Kepemilikan
      const materi = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: {
          program: true,
          materi_resource: true,
        },
      });

      if (!materi) {
        return res.status(404).json({ message: "Materi tidak ditemukan." });
      }

      if (materi.program.id_campus !== idCampus) {
        return res.status(403).json({
          message: "Anda tidak memiliki akses untuk menghapus materi ini.",
        });
      }

      // 2. Hapus File Fisik (jika tidak digunakan oleh materi lain)
      if (materi.materi_resource && materi.materi_resource.length > 0) {
        for (const resource of materi.materi_resource) {
          if (resource.type === "file" && resource.path_file) {
            // Cek apakah file digunakan oleh materi lain (id_materi berbeda)
            const isUsedByOther = await prisma.materi_resource.findFirst({
              where: {
                path_file: resource.path_file,
                id_materi: { not: idMateriInt },
              },
            });

            // Jika tidak digunakan oleh materi lain, hapus file fisiknya
            if (!isUsedByOther) {
              const filePath = path.join(PROJECT_ROOT, resource.path_file);
              if (fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath);
                } catch (err) {
                  console.error(`Gagal menghapus file: ${filePath}`, err);
                }
              }
            }
          }
        }
      }

      // 3. Hapus Materi dari Database
      // onDelete: Cascade pada schema akan otomatis menghapus materi_resource terkait
      await prisma.materi.delete({
        where: { id: idMateriInt },
      });

      return res.status(200).json({
        message: "Materi berhasil dihapus beserta resource-nya.",
      });
    } catch (error) {
      console.error("Gagal menghapus materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus materi.",
        error: error.message,
      });
    }
  },
);

// send message to mentee
router.post(
  "/send-message-to-mentee",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const { subject, message, idCampus, idMentee } = req.body;
    const senderId = req.user.id;

    if (!subject || !message || !idMentee) {
      return res.status(400).json({
        message: "Subject, message, dan idMentee wajib diisi.",
      });
    }

    // Validasi idCampus jika dikirim
    if (idCampus && parseInt(idCampus) !== senderId) {
      return res.status(403).json({
        message: "Anda tidak berhak mengirim pesan atas nama kampus lain.",
      });
    }

    try {
      // Ambil data mentee
      const mentee = await prisma.mentee.findUnique({
        where: { id: parseInt(idMentee) },
        select: { email: true, username: true },
      });

      if (!mentee) {
        return res.status(404).json({
          message: "Mentee tidak ditemukan.",
        });
      }

      // Ambil data kampus pengirim
      const campus = await prisma.campus.findUnique({
        where: { id: senderId },
        select: { campus_name: true },
      });

      if (!campus) {
        return res.status(404).json({
          message: "Data kampus pengirim tidak ditemukan.",
        });
      }

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
      const attachments = [];
      if (fs.existsSync(logoPath)) {
        attachments.push({
          filename: "logo-text.png",
          path: logoPath,
          cid: "logoTempa",
        });
      }

      // Kirim Email
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: mentee.email,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              ${
                fs.existsSync(logoPath)
                  ? '<img src="cid:logoTempa" alt="TEMPA Logo" style="max-width: 150px; height: auto;" />'
                  : "<h2>TEMPA</h2>"
              }
            </div>
            <h2 style="color: #333; text-align: center;">Pesan Baru dari ${
              campus.campus_name
            }</h2>
            <p style="font-size: 16px; color: #555;">Halo <strong>${
              mentee.username
            }</strong>,</p>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">
              Anda menerima pesan baru dari kampus <strong>${
                campus.campus_name
              }</strong>:
            </p>
            <div style="background-color: #f9f9f9; border-left: 5px solid #013B35; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #013B35;">${subject}</p>
              <p style="margin: 5px 0 0; color: #555;">${message}</p>
            </div>
            <br>
            <p style="font-size: 16px; color: #555;">Salam hangat,<br><strong>${
              campus.campus_name
            }</strong></p>
          </div>
        `,
        attachments: attachments,
      });

      return res.status(200).json({
        message: "Pesan berhasil dikirim ke email mentee.",
      });
    } catch (error) {
      console.error("Gagal mengirim pesan:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengirim pesan.",
        error: error.message,
      });
    }
  },
);

// send bulk message to mentees
router.post(
  "/send-bulk-message",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const { subject, message, idCampus, idMentee } = req.body;
    const senderId = req.user.id;

    if (
      !subject ||
      !message ||
      !idMentee ||
      !Array.isArray(idMentee) ||
      idMentee.length === 0
    ) {
      return res.status(400).json({
        message: "Subject, message, dan idMentee (array) wajib diisi.",
      });
    }

    // Validasi idCampus jika dikirim
    if (idCampus && parseInt(idCampus) !== senderId) {
      return res.status(403).json({
        message: "Anda tidak berhak mengirim pesan atas nama kampus lain.",
      });
    }

    try {
      // Ambil data kampus pengirim
      const campus = await prisma.campus.findUnique({
        where: { id: senderId },
        select: { campus_name: true },
      });

      if (!campus) {
        return res.status(404).json({
          message: "Data kampus pengirim tidak ditemukan.",
        });
      }

      // Ambil data mentee
      const mentees = await prisma.mentee.findMany({
        where: {
          id: { in: idMentee.map((id) => parseInt(id)) },
        },
        select: { email: true, username: true },
      });

      if (mentees.length === 0) {
        return res.status(404).json({
          message: "Tidak ada mentee yang ditemukan dengan ID yang diberikan.",
        });
      }

      // 3. Masukkan ke Antrean (TIDAK di-await agar respon instan)
      mentees.forEach((mentee) => {
        mailQueue.push({
          menteeEmail: mentee.email,
          menteeUsername: mentee.username,
          campusName: campus.campus_name,
          subject: subject,
          message: message,
        });
      });

      return res.status(200).json({
        message: `Pesan berhasil dikirim ke ${mentees.length} mentee.`,
      });
    } catch (error) {
      console.error("Gagal mengirim pesan bulk:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengirim pesan.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// GET DASHBOARD STATISTICS
// =======================================================================
router.get(
  "/get-dashboard-statistics",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const getCampusSubscription = await prisma.campus_subscription.findFirst({
        where: {
          id_campus: idCampus,
          id_package: 2,
          expired_date: {
            gte: new Date(),
          },
        },
      });

      // check subscription
      if (!getCampusSubscription) {
        return res.status(403).json({
          message: "Subscription required to access this resource.",
        });
      }

      // get total profile visits
      const campusData = await prisma.campus.findUnique({
        where: { id: idCampus },
        select: { seen: true },
      });

      // get total program visits
      const programSeen = await prisma.program.aggregate({
        where: { id_campus: idCampus },
        _sum: { seen: true },
      });

      // 3. get data mentee major interest (Global)
      const majorInterests = await prisma.standard_major.findMany({
        select: {
          id: true,
          major_name: true,
          _count: {
            select: {
              mentee_major_interest: true,
            },
          },
        },
        orderBy: {
          mentee_major_interest: {
            _count: "desc",
          },
        },
      });

      const formattedMajorInterests = majorInterests.map((m) => ({
        major_name: m.major_name,
        total_interest: m._count.mentee_major_interest,
      }));

      // 4. get data city Mentee (Global)
      const cityDistribution = await prisma.mentee.groupBy({
        by: ["city"],
        _count: {
          city: true,
        },
        where: {
          city: {
            not: null,
          },
        },
        orderBy: {
          _count: {
            city: "desc",
          },
        },
      });

      const formattedCityDistribution = cityDistribution.map((item) => ({
        city: item.city,
        total: item._count.city,
      }));

      // get data education status mentee (Global)
      const educationStatusDistribution = await prisma.mentee.groupBy({
        by: ["education_status"],
        _count: {
          education_status: true,
        },
      });

      const formattedEducationStatus = educationStatusDistribution.map(
        (item) => ({
          status: item.education_status,
          total: item._count.education_status,
        }),
      );

      return res.status(200).json({
        message: "Data statistik dashboard berhasil diambil.",
        data: {
          total_profile_visits: campusData?.seen || 0,
          total_program_visits: programSeen._sum.seen || 0,
          major_interests: formattedMajorInterests,
          mentee_demographics: {
            city_distribution: formattedCityDistribution,
            education_status_distribution: formattedEducationStatus,
          },
        },
      });
    } catch (error) {
      console.error("Gagal mengambil statistik dashboard:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil statistik.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// GET SUBSCRIPTION PACKAGES
// =======================================================================
router.get(
  "/subscription-packages",
  authenticateUser,
  authorizeRoles(["campus"]),
  async (req, res) => {
    const idCampus = req.user.id;

    try {
      const packages = await prisma.subscription_package.findMany({
        orderBy: {
          price: "asc",
        },
      });

      // get subscription campus
      const getCampusSubscription = await prisma.campus_subscription.findFirst({
        where: {
          id_campus: idCampus,
          status: "active",
          expired_date: {
            gte: new Date(),
          },
        },
        select: {
          id_package: true,
          expired_date: true,
          subscription_package: {
            select: {
              id: true,
              package_name: true,
              sub_heading: true,
            },
          },
        },
      });

      // Convert BigInt to Number to avoid serialization error
      const formattedPackages = packages.map((pkg) => ({
        ...pkg,
        price: Number(pkg.price),
      }));

      const formattedCampusSubscription = getCampusSubscription
        ? {
            id_package: getCampusSubscription.id_package,
            expired_date: getCampusSubscription.expired_date,
            package_name:
              getCampusSubscription.subscription_package?.package_name,
            sub_heading:
              getCampusSubscription.subscription_package?.sub_heading,
          }
        : null;

      return res.status(200).json({
        message: "Data paket berlangganan berhasil diambil.",
        data: formattedPackages,
        campusSubscription: formattedCampusSubscription,
      });
    } catch (error) {
      console.error("Gagal mengambil data paket berlangganan:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data paket.",
        error: error.message,
      });
    }
  },
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
  },
);

export default router;
