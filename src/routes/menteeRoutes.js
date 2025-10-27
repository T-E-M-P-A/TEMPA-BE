import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateUser } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import { GoogleGenAI } from "@google/genai";
import formatPathToUrl from "../controllers/formatPathUrl.js";

const router = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

// Oauth mentee with google
router.post("/login-mentee", async (req, res) => {
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
    const userRecord = await findOrCreateUser(payload);

    // get user
    const localUserId = userRecord.id;

    const jwtPayload = {
      id: localUserId, // id user
      username: name,
      email: email,
      role: "mentee",
    };

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

// get the program that the mentee has registered for
router.get(
  "/mentee/get-program-mentee",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;

    try {
      const menteeProgressWithProgram = await prisma.mentee_progress.findMany({
        where: {
          id_mentee: menteeId,
        },
        select: {
          id: true,
          completion_status: true,
          final_score: true,

          // get program by id from table program
          program: {
            select: {
              id: true,
              program_name: true,
              description: true,
              start_date: true,
              end_date: true,
              id_mentor: true,
              capacity: true,
              path_gambar: true,

              // get sesi program
              sesi_program: {
                select: {
                  id: true,
                  type_sesi: true,
                  description: true,
                  sesi_date: true,
                },
              },

              // get major program
              campus_program_id_majorTocampus: {
                select: {
                  id: true,

                  // get major name
                  standard_major: {
                    select: {
                      major_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Output always array
      const results = Array.isArray(menteeProgressWithProgram)
        ? menteeProgressWithProgram
        : [];

      // if program null
      if (results.length === 0) {
        return res
          .status(200)
          .json({ message: "Mentee belum terdaftar di program manapun." });
      }

      const programs = menteeProgressWithProgram.map((item) => {
        // --- Langkah 1: Logika Pembersihan Path (DIPINDAHKAN KE DALAM) ---
        const rawPath = item.program.path_gambar;
        let finalPath = rawPath;

        if (finalPath) {
          // 1. Bersihkan slash di depan jika ada (Dari '/uploads/...')
          if (finalPath.startsWith("/")) {
            finalPath = finalPath.substring(1);
          }

          // 2. POTONG string "uploads/" di awal path (Karena Express sudah memetakan folder 'uploads')
          if (finalPath.startsWith("uploads/")) {
            finalPath = finalPath.substring("uploads/".length);
          }
        }

        return {
          progress_id: item.id,
          completion_status: item.completion_status,
          final_score: item.final_score,

          program_details: {
            id: item.program.id,
            program_name: item.program.program_name,
            description: item.program.description,
            start_date: item.program.start_date,
            end_date: item.program.end_date,
            capacity: item.program.capacity,

            // KOREKSI: Gunakan finalPath yang sudah dipotong dan dibersihkan
            image_url: finalPath ? `${BASE_URL}/public/${finalPath}` : null,

            // Gabungkan data relasi
            sesi_program: item.program.sesi_program,
            major_name:
              item.program.campus_program_id_majorTocampus.standard_major
                .major_name,
          },
        };
      });

      console.log(programs);

      return res.status(200).json({
        message: "Daftar program mentee berhasil diambil.",
        data: programs,
      });
    } catch (error) {
      console.error("Kesalahan saat mengambil data program mentee:", error);
      return res.status(500).json({ message: "Internal server error." });
    }
  }
);

// get all program
router.get(
  "/mentee/all-program",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const getAllProgram = await prisma.program.findMany({
        include: {
          campus_program_id_campusTocampus: {
            select: {
              campus_name: true,
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      const formatGetAllProgram = getAllProgram.map((item) => {
        const rawPath = item.path_gambar;
        let finalPath = rawPath;

        if (finalPath) {
          if (finalPath.startsWith("/")) {
            finalPath = finalPath.substring(1);
          }
          if (finalPath.startsWith("uploads/")) {
            finalPath = finalPath.substring("uploads/".length);
          }
        }

        // Menentukan URL gambar akhir
        const imageUrl = finalPath ? `${BASE_URL}/public/${finalPath}` : null;

        // 1. Ambil semua properti item
        const newItem = { ...item };

        // 2. Hapus properti path_gambar yang lama (opsional, tapi disarankan)
        delete newItem.path_gambar;

        // 3. Tambahkan properti image_url yang baru
        newItem.image_url = imageUrl;

        // 4. Tambahkan/ubah struktur properti relasi sesuai kebutuhan (jika diperlukan)
        // Contoh: Membuat major_name lebih mudah diakses (opsional)
        newItem.major_name =
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null;
        newItem.campus_name =
          item.campus_program_id_campusTocampus?.campus_name || null;

        // Hapus objek relasi yang panjang jika sudah tidak diperlukan
        delete newItem.campus_program_id_majorTocampus;
        delete newItem.campus_program_id_campusTocampus;

        return newItem;
      });
      console.log(formatGetAllProgram);

      // Mengirimkan data sebagai respons
      res.status(200).json({
        message: "Data Berhasil Dipanggil",
        data: formatGetAllProgram,
      });
    } catch (error) {
      console.error("Error fetching programs:", error);
      // Mengirimkan respons error
      res
        .status(500)
        .json({ msg: "Gagal mengambil data program", error: error.message });
    }
  }
);

// get detail program
router.get(
  "/mentee/detail-program/:id",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const idProgram = req.params.id;

      const detailProgram = await prisma.program.findUnique({
        where: {
          id: parseInt(idProgram),
        },
        include: {
          campus_program_id_campusTocampus: {
            select: {
              id: true,
              campus_name: true,
              address: true,
              email: true,
              path_logo: true,
              path_banner: true,
            },
          },
          mentor: {
            select: {
              name: true,
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
              type_sesi: true,
              description: true,
            },
          },
        },
      });

      if (!detailProgram) {
        // Tangani kasus 404 jika program tidak ditemukan
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }

      const item = detailProgram;

      // 1. FORMAT PATH GAMBAR PROGRAM UTAMA
      // Gunakan fungsi helper untuk memformat path_gambar program
      const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

      // 2. FORMAT PATH GAMBAR KAMPUS
      const campusData = item.campus_program_id_campusTocampus;

      // Format path_logo
      const logoUrl = formatPathToUrl(campusData.path_logo, BASE_URL);

      // Format path_banner
      const bannerUrl = formatPathToUrl(campusData.path_banner, BASE_URL);

      // 3. BUAT OBJEK HASIL AKHIR (formatGetDetailProgram)
      const formatGetDetailProgram = { ...item };

      // a. Hapus path_gambar lama dan tambahkan image_url baru ke level atas
      delete formatGetDetailProgram.path_gambar;
      formatGetDetailProgram.image_url = imageUrl;

      // b. Hapus path_logo dan path_banner lama dan tambahkan URL baru ke properti kampus
      delete formatGetDetailProgram.campus_program_id_campusTocampus.path_logo;
      delete formatGetDetailProgram.campus_program_id_campusTocampus
        .path_banner;

      // Tambahkan URL yang sudah diformat
      formatGetDetailProgram.campus_program_id_campusTocampus.logo_url =
        logoUrl;
      formatGetDetailProgram.campus_program_id_campusTocampus.banner_url =
        bannerUrl;

      console.log(formatGetDetailProgram);

      return res.status(200).json({
        message: "Detail program ditemukan",
        data: formatGetDetailProgram,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(404)
        .json({ message: "Not Found due to internal error." });
    }
  }
);

// get all campus
router.get(
  "/mentee/all-campus",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const getAllCampus = await prisma.campus.findMany({
        select: {
          id: true,
          campus_name: true,
          address: true,
          path_logo: true,
          path_banner: true,
        },
      });

      if (!getAllCampus) {
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      const formatGetAllCampus = getAllCampus.map((item) => {
        // get raw path
        const rawLogo = item.path_logo;
        const rawBanner = item.path_banner;

        // format using function formatPathToUrl
        const logoUrl = formatPathToUrl(rawLogo, BASE_URL);
        const bannerUrl = formatPathToUrl(rawBanner, BASE_URL);

        // copy all data object
        const newItem = { ...item };

        // delete old path before format
        delete newItem.path_logo;
        delete newItem.path_banner;

        // add new path format to the object
        newItem.logo_url = logoUrl;
        newItem.banner_url = bannerUrl;

        return newItem;
      });

      console.log(formatGetAllCampus);

      return res.status(200).json({
        message: "Data campus ditemukan",
        data: formatGetAllCampus,
      });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ msg: "Gagal mengambil data program", error: error.message });
    }
  }
);

// register program for mentee
router.post(
  "/mentee/register-program/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const idMentee = req.user.id;
    const { idProgram } = req.params;
    const idProgramInt = parseInt(idProgram);

    // Pastikan ID tersedia (validasi awal)
    if (!idProgram || !idMentee) {
      // Lebih baik gunakan 400 Bad Request jika parameter hilang
      return res.status(400).json({
        message: "ID Program atau ID Mentee tidak ditemukan.",
      });
    }

    try {
      // check if mentee is already register to program
      const existingEnrollment = await prisma.mentee_progress.findFirst({
        where: {
          id_mentee: idMentee,
          // PERHATIAN: Pastikan Anda menggunakan idProgram, BUKAN idMentee, di sini
          id_program: idProgramInt,
        },
      });

      // if already register program
      if (existingEnrollment) {
        console.log(
          `Mentee ID ${idMentee} sudah terdaftar di Program ID ${idProgramInt}. Pendaftaran dibatalkan`
        );
        return res.status(409).json({
          message: `Anda sudah mendaftar program tersebut!`,
          data: existingEnrollment,
        });
      }

      // check if mentee is already register to program
      const programClosed = await prisma.program.findFirst({
        where: {
          id: idProgramInt,
          program_status: "closed",
        },
      });

      // if program closed
      if (programClosed) {
        console.log(`Program sudah tutup/selesai`);
        return res.status(409).json({
          message: `Program sudah tutup/selesai!`,
          data: programClosed,
        });
      }

      // register program
      const registerProgram = await prisma.mentee_progress.create({
        data: {
          completion_status: "on_going",
          completion_date: null,
          id_mentee: idMentee,
          id_program: idProgramInt,
        },
      });
      console.log(registerProgram);

      return res.status(201).json({
        message: `Pendaftaran berhasil!`,
        data: registerProgram,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan saat memproses pendaftaran program.",
        error: error.message,
      });
    }
  }
);

// get majors
router.get(
  "/mentee/all-majors",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const allMajors = await prisma.standard_major.findMany({});

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

// test gemini ai
router.get(
  "/testing-gemini-ai",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Sebagai Konselor Karir Ahli, rekomendasikan 2-3 jurusan kuliah yang paling sesuai untuk profil berikut. Jelaskan mengapa setiap jurusan cocok dan sebutkan 2 contoh profesi yang relevan.
        [1] Minat Akademik: Bahasa Inggris
        [2] Aktivitas Luang: merancang poster
        [3] Dampak Karir: Ingin nge-solve problem yang ada di perusahan
        [4] Lingkungan Kerja: Bekerja secara mandiri di balik meja
        [5] Kekuatan Diri: Daya analisis yang tajam
        [6] Tantangan Disukai: membuat sistem bekerja lebih baik
        [7] Toleransi Aturan: Lingkungan fleksibel yang menuntut improvisasi dan ide baru
        [8] Prioritas Gaji (Skala 5): 5
        [9] Jurusan yang Dipertimbangkan: Belum ada
        [10] Pendekatan Keputusan: Data, angka, dan fakta yang teruji (pendekatan Kuantitatif)
        Berikan jawaban dalam format poin-poin yang mudah dibaca.`,
      });
      console.log(response.text);

      return res.status(200).json({
        message: response.text,
      });
    } catch (error) {
      return res.json({
        message: error,
      });
    }
  }
);

// test gemini ai
router.get(
  "/testing-gemini-ai",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Sebagai Konselor Karir Ahli, rekomendasikan 2-3 jurusan kuliah yang paling sesuai untuk profil berikut. Jelaskan mengapa setiap jurusan cocok dan sebutkan 2 contoh profesi yang relevan.
        [1] Minat Akademik: Bahasa Inggris
        [2] Aktivitas Luang: merancang poster
        [3] Dampak Karir: Ingin nge-solve problem yang ada di perusahan
        [4] Lingkungan Kerja: Bekerja secara mandiri di balik meja
        [5] Kekuatan Diri: Daya analisis yang tajam
        [6] Tantangan Disukai: membuat sistem bekerja lebih baik
        [7] Toleransi Aturan: Lingkungan fleksibel yang menuntut improvisasi dan ide baru
        [8] Prioritas Gaji (Skala 5): 5
        [9] Jurusan yang Dipertimbangkan: Belum ada
        [10] Pendekatan Keputusan: Data, angka, dan fakta yang teruji (pendekatan Kuantitatif)
        Berikan jawaban dalam format poin-poin yang mudah dibaca.`,
      });
      console.log(response.text);

      return res.status(200).json({
        message: response.text,
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
  "/testing-midleware-mentee",
  authenticateUser,
  authorizeRoles(["mentee"]),
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
