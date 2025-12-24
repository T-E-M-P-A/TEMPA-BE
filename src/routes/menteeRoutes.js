import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateUser } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import { GoogleGenAI } from "@google/genai";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import generateContentWithRetry from "../controllers/generateContentWithRetry.js";

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
        verify_status: userRecord.verify_status,
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
              start_program_date: true,
              end_program_date: true,
              capacity: true,
              path_gambar: true,
              onsiteLocationName: true,
              type_sesi: true,

              // get sesi program
              // sesi_program: {
              //   select: {
              //     id: true,
              //     type_sesi: true,
              //     description: true,
              //     sesi_date: true,
              //   },
              // },

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
            start_date: item.program.start_program_date,
            end_date: item.program.end_program_date,
            capacity: item.program.capacity,
            onsiteLocationName: item.program.onsiteLocationName,
            type_sesi: item.program.type_sesi,

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
        where: {
          visibility: "public",
          campus_program_id_campusTocampus: {
            verification_status: "accepted",
          },
        },
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
        where: {
          verification_status: "accepted",
        },
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

// get detail campus
router.get(
  "/mentee/detail-campus/:id",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const idCampus = req.params.id;

      const detailCampus = await prisma.campus.findUnique({
        where: {
          id: parseInt(idCampus),
        },
        select: {
          id: true,
          campus_name: true,
          email: true,
          path_logo: true,
          path_banner: true,
          address: true,
          description: true,
          verification_status: false,
          sub_google_id: false,
          vision_mission: true,
          password: false,

          program_program_id_campusTocampus: {
            where: {
              visibility: "public",
            },
            select: {
              id: true,
              program_name: true,
              path_gambar: true,
              description: true,
              capacity: true,
              type_sesi: true,
              start_regis_date: true,
              end_regis_date: true,
              start_program_date: true,
              end_program_date: true,
              onsiteLocationName: true,
              campus_program_id_majorTocampus: {
                include: {
                  standard_major: {
                    select: {
                      major_name: true,
                    },
                  },
                },
              },
            },
          },
          major: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      if (!detailCampus) {
        return res.status(404).json({ message: "Kampus tidak ditemukan." });
      }

      let formattedCampus = { ...detailCampus };

      // delete old path_logo and add new url logo_url
      formattedCampus.logo_url = formatPathToUrl(
        formattedCampus.path_logo,
        BASE_URL
      );
      delete formattedCampus.path_logo;

      // delete old path_banner and add new url banner_url
      formattedCampus.banner_url = formatPathToUrl(
        formattedCampus.path_banner,
        BASE_URL
      );
      delete formattedCampus.path_banner;

      // 🏆 3. FORMAT PATH GAMBAR DI DALAM RELASI PROGRAM (jika ada)
      if (formattedCampus.program_program_id_campusTocampus) {
        formattedCampus.program_program_id_campusTocampus =
          formattedCampus.program_program_id_campusTocampus.map((program) => {
            // Duplikasi objek program
            let formattedProgram = { ...program };

            // Format path_gambar program dan hapus path lama
            formattedProgram.image_url = formatPathToUrl(
              formattedProgram.path_gambar,
              BASE_URL
            );
            delete formattedProgram.path_gambar;

            return formattedProgram;
          });
      }

      console.log(formattedCampus);

      return res.status(200).json({
        message: "Detail campus ditemukan",
        data: formattedCampus,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(404)
        .json({ message: "Not Found due to internal error." });
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

      // Check program status and capacity
      const programData = await prisma.program.findUnique({
        where: {
          id: idProgramInt,
        },
        select: {
          capacity: true,
        },
      });

      if (!programData) {
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }

      if (new Date(programData.end_regis_date) < new Date()) {
        return res.status(409).json({
          message: "Pendaftaran sudah tutup!",
        });
      }

      if (new Date(programData.end_program_date) < new Date()) {
        return res.status(409).json({
          message: "Program sudah tutup/selesai!",
        });
      }

      if (programData.capacity <= 0) {
        return res.status(409).json({
          message: "Kuota program sudah penuh!",
        });
      }

      // Register program and decrement capacity
      const registerProgram = await prisma.$transaction(async (tx) => {
        const newProgress = await tx.mentee_progress.create({
          data: {
            completion_status: "on_going",
            completion_date: null,
            id_mentee: idMentee,
            id_program: idProgramInt,
          },
        });

        await tx.program.update({
          where: { id: idProgramInt },
          data: {
            capacity: { decrement: 1 },
          },
        });

        return newProgress;
      });
      // console.log(registerProgram);

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

// get detail majors
router.get(
  "/mentee/detail-major/:majorName",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const { majorName } = req.params;

      const detailMajor = await prisma.standard_major.findFirst({
        where: {
          major_name: majorName,
        },
        include: {
          major: {
            include: {
              campus: {
                select: {
                  id: true,
                  campus_name: true,
                  path_banner: true,
                },
              },
              program_program_id_majorTocampus: {
                include: {
                  campus_program_id_majorTocampus: {
                    include: {
                      standard_major: true,
                      campus: {
                        select: {
                          campus_name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Cek jika jurusan tidak ditemukan
      if (!detailMajor) {
        return res.status(404).json({
          message: "Jurusan tidak ditemukan",
          data: null,
        });
      }

      // Format data untuk menyertakan URL gambar yang valid
      const formattedDetailMajor = {
        ...detailMajor,
        campus: detailMajor.major.map((m) => {
          // Format Banner Kampus
          const campusBannerUrl = formatPathToUrl(
            m.campus?.path_banner,
            BASE_URL
          );

          // Format Gambar Program
          const formattedPrograms = m.program_program_id_majorTocampus.map(
            (prog) => {
              const programImageUrl = formatPathToUrl(
                prog.path_gambar,
                BASE_URL
              );
              const newProg = { ...prog, image_url: programImageUrl };
              delete newProg.path_gambar;
              return newProg;
            }
          );

          const newMajor = {
            ...m,
            campus: {
              ...m.campus,
              banner_url: campusBannerUrl,
            },
            program_program_id_majorTocampus: formattedPrograms,
          };

          if (newMajor.campus) {
            delete newMajor.campus.path_banner;
          }

          return newMajor;
        }),
      };

      return res.status(200).json({
        message: "Detail jurusan berhasil diambil",
        data: formattedDetailMajor,
      });
    } catch (error) {
      console.error("Kesalahan saat mengambil detail jurusan:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server: " + error.message,
        error: error,
      });
    }
  }
);

// recomendation majors
router.post(
  "/mentee/recomendation-major",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const menteeId = req.user.id;
      const { q1, q2, q3, q4, q5, q6, q7, q8, q9, q10 } = req.body;

      const checkResponse = await prisma.recomendation_majors.findFirst({
        where: {
          id_mentee: menteeId,
        },
      });

      // check if mentee already assign form
      if (checkResponse) {
        return res.status(403).json({
          message:
            "Akses Ditolak. Anda hanya diizinkan mengisi tes jurusan satu kali!",
        });
      }

      const requiredFields = [
        { key: "q1", name: "Minat Akademik Inti" },
        { key: "q2", name: "Aktivitas Pilihan" },
        { key: "q3", name: "Motivasi Karir" },
        { key: "q4", name: "Preferensi Lingkungan Kerja" },
        { key: "q5", name: "Kekuatan Diri" },
        { key: "q6", name: "Tantangan yang Disukai" },
        { key: "q7", name: "Toleransi Risiko & Aturan" },
        { key: "q8", name: "Pentingnya Gaji (Skala 1-5)" },
        { key: "q9", name: "Jurusan yang Sudah Ada di Pikiran" },
        { key: "q10", name: "Data Kuantitatif/Kualitatif" },
      ];

      const missingFields = [];

      requiredFields.forEach((field) => {
        const value = req.body[field.key];

        // if null, undefined, or string null
        if (
          value === null ||
          value === undefined ||
          (typeof value === "string" && value.trim() === "")
        ) {
          missingFields.push(field.name);
        }
      });

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: "Validasi Gagal: Semua pertanyaan wajib diisi.",
          details: `Pertanyaan yang belum terjawab: ${missingFields.join(
            ", "
          )}`,
          missingFields: missingFields,
        });
      }

      // get all data majors for ai
      const majors = await prisma.standard_major.findMany({
        select: {
          major_name: true,
        },
      });

      // conversion result from majors to string/array for AI
      const availableMajors = majors.map((m) => m.major_name).join(", ");

      // Buat prompt
      const userProfile = `
        [1] Minat Akademik Inti: ${q1}
        [2] Aktivitas Pilihan: ${q2}
        [3] Motivasi Karir: ${q3}
        [4] Preferensi Lingkungan Kerja: ${q4}
        [5] Kekuatan Diri: ${q5}
        [6] Tantangan yang Disukai: ${q6}
        [7] Toleransi Risiko & Aturan: ${q7}
        [8] Pentingnya Gaji (Skala 1-5): ${q8}
        [9] Jurusan yang Sudah Ada di Pikiran: ${q9}
        [10] Data Kuantitatif/Kualitatif: ${q10}
      `;

      const systemInstruction = `Anda adalah Konselor Karir Ahli di Indonesia. Tugas Anda adalah menganalisis profil pengguna berikut dan merekomendasikan 2 hingga 3 jurusan kuliah yang paling sesuai.

        Anda harus membatasi rekomendasi hanya pada jurusan yang tersedia dalam daftar berikut: ${availableMajors}.

        Berikan keluaran Anda dalam format JSON array of objects dengan struktur ini:
        [
          {
            "jurusan": "Nama Jurusan (HARUS ada di daftar yang tersedia)",
            "kesesuaian": "Penjelasan ringkas (1-2 kalimat) mengapa jurusan ini cocok dengan profil pengguna.",
            "profesi_relevan": ["Profesi A", "Profesi B"]
          },
          // ... objek kedua
          // ... objek ketiga (opsional)
        ]
        `;

      // config for respons JSON
      const modelConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              jurusan: { type: "STRING" },
              kesesuaian: { type: "STRING" },
              profesi_relevan: { type: "ARRAY", items: { type: "STRING" } },
            },
          },
        },
      };

      // get eai
      const response = await generateContentWithRetry(
        modelConfig,
        userProfile,
        systemInstruction
      );

      const aiRecommendations = JSON.parse(response.text);

      // save response to database
      const saveResponseAi = await prisma.recomendation_majors.create({
        data: {
          response_ai: aiRecommendations,
          id_mentee: menteeId,
        },
      });

      console.log("Rekomendasi AI:", aiRecommendations);

      return res.status(200).json({
        message: "Rekomendasi jurusan berhasil dibuat.",
        data: aiRecommendations,
      });
    } catch (error) {
      // Penanganan error umum, yang juga akan menangani error setelah MAX_RETRIES
      console.error("Kesalahan saat memproses rekomendasi AI..", error);

      let errorMessage =
        "Terjadi kesalahan internal saat memproses rekomendasi.";

      // Jika error berasal dari retry logic yang gagal
      if (error.message.includes("Gagal mendapatkan rekomendasi AI")) {
        errorMessage = error.message;
      }

      return res.status(500).json({
        message: errorMessage,
        error: error.message,
      });
    }
  }
);

// get response ai from databse if mentee already assign form
router.get(
  "/mentee/get-response",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    try {
      const menteeId = req.user.id;

      const getResponse = await prisma.recomendation_majors.findFirst({
        where: {
          id_mentee: menteeId,
        },
        select: {
          response_ai: true,
        },
      });

      console.log(getResponse);

      if (!getResponse) {
        return res.status(404).json({
          message: "Anda belum mengisi form",
        });
      }

      return res.status(200).json({
        message: "get response berhasil",
        data: getResponse,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Server sedang bermasalahan",
        error: error.message,
      });
    }
  }
);

// get materi mentee
router.get(
  "/mentee/get-materi/:id_program",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    // Pastikan idProgram adalah integer
    const idProgram = parseInt(req.params.id_program);
    const idMentee = parseInt(req.user.id);

    // Cek apakah parsing berhasil
    if (isNaN(idProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid.",
      });
    }

    try {
      const getProgramStatus = await prisma.mentee_progress.findFirst({
        where: {
          id_mentee: idMentee,
          id_program: idProgram,
        },
        select: {
          completion_status: true,
        },
      });
      // 1. UPDATE Kueri Prisma: Sertakan relasi 'materi_resource'
      const materiList = await prisma.materi.findMany({
        where: {
          id_program: idProgram,
          visibility: "public",
        },
        include: {
          program: {
            select: {
              program_name: true,
              description: true,
              start_program_date: true,
              end_program_date: true,
            },
          },
          // Sertakan semua resource (file/video/kuis) untuk setiap materi
          materi_resource: true,
        },
        orderBy: {
          create_at: "asc",
        },
      });

      if (materiList.length === 0) {
        // Ambil detail program secara terpisah
        const programData = await prisma.program.findUnique({
          where: {
            id: idProgram,
          },
          select: {
            program_name: true,
            description: true,
            end_program_date: true,
            start_program_date: true,
          },
        });

        // Cek jika program itu sendiri tidak ditemukan
        if (!programData) {
          return res.status(404).json({
            message: "Program tidak ditemukan.",
          });
        }

        // Jika program ditemukan tapi materinya kosong, kirim detail program dengan array materi kosong
        return res.status(200).json({
          message: "Materi belum ditambahkan untuk program ini.",
          // Kirim data yang dibutuhkan frontend untuk header
          data: [
            {
              completion_status:
                getProgramStatus?.completion_status || "on_going",
              program_name: programData.program_name,
              program_description: programData.description,
              end_program_date: programData.end_program_date,
              start_program_date: programData.start_program_date,
              resources: [],
              // Berikan properti materi minimal agar frontend bisa membaca
              title: null,
              description: null,
              id: null,
            },
          ],
        });
      }

      // 2. UPDATE Logika Pemformatan: Pindahkan path_file ke resource
      const formattedMateriPath = materiList.map((item) => {
        // Ambil data program untuk dipindahkan ke tingkat atas
        const { program, materi_resource, ...materiData } = item;

        // Map dan format path_file untuk SETIAP resource
        const formattedResources = materi_resource.map((resource) => {
          const rawPathFile = resource.path_file;
          const fileUrl = formatPathToUrl(rawPathFile, BASE_URL);

          return {
            ...resource,
            file_url: fileUrl, // Tambahkan URL yang sudah diformat
            // Hapus path_file mentah dari objek resource jika perlu
            // delete resource.path_file;
          };
        });

        // Gabungkan semua data yang dibutuhkan
        const newItem = {
          ...materiData,
          completion_status: getProgramStatus?.completion_status || "on_going",
          program_name: program.program_name,
          program_description: program.description,
          end_program_date: program.end_program_date,
          start_program_date: program.start_program_date,
          resources: formattedResources, // Masukkan resource yang sudah diformat
        };

        // Hapus objek program yang sudah diekstrak
        delete newItem.program;

        return newItem;
      });

      console.log(formattedMateriPath);

      // 3. Beri respons sukses
      return res.status(200).json({
        message: `Materi untuk program ID ${idProgram} berhasil didapatkan`,
        data: formattedMateriPath,
      });
    } catch (error) {
      console.error("Gagal mengambil materi:", error);

      // 4. Tangani error database atau server
      return res.status(500).json({
        message: "Terjadi kesalahan saat mengambil data materi.",
        error: error.message,
      });
    }
  }
);

// give feedback to program
router.post(
  "/mentee/program-feedback/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const idMentee = req.user.id;
    const { idProgram } = req.params;
    const { rating, feedback } = req.body;
    const idProgramInt = parseInt(idProgram);

    if (isNaN(idProgramInt)) {
      return res.status(400).json({ message: "ID Program tidak valid." });
    }

    if (!rating || !feedback) {
      return res.status(400).json({
        message: "Rating dan evaluasi wajib diisi.",
      });
    }

    try {
      // 1. Cek apakah program ada
      const program = await prisma.program.findUnique({
        where: { id: idProgramInt },
      });

      if (!program) {
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }

      // 2. Cek apakah mentee terdaftar di program tersebut
      const isEnrolled = await prisma.mentee_progress.findFirst({
        where: {
          id_mentee: idMentee,
          id_program: idProgramInt,
        },
      });

      if (!isEnrolled) {
        return res.status(403).json({
          message:
            "Anda tidak terdaftar di program ini, tidak bisa memberikan feedback.",
        });
      }

      // 3. Simpan feedback
      const newFeedback = await prisma.program_feedback.create({
        data: {
          id_program: idProgramInt,
          id_mentee: idMentee,
          rating: parseInt(rating),
          evaluation: feedback,
        },
      });

      const changeCompletionStatus = await prisma.mentee_progress.update({
        where: {
          id: isEnrolled.id,
        },
        data: {
          completion_status: "completed",
          completion_date: new Date(),
        },
      });

      return res.status(201).json({
        message: "Feedback berhasil dikirim.",
        data: newFeedback,
      });
    } catch (error) {
      console.error("Gagal mengirim feedback:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengirim feedback.",
        error: error.message,
      });
    }
  }
);

// verify mentee
router.put(
  "/mentee/verify-mentee",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;
    const {
      fullName,
      email,
      gender,
      educationStatus,
      valueProvince,
      valueCity,
      valueSubdistrict,
      valueWard,
      dob,
      terms,
      consent,
    } = req.body;

    // console.log(req.body);

    if (!terms || !consent) {
      return res.status(400).json({
        message: "Anda harus menyetujui syarat dan ketentuan.",
      });
    }

    try {
      // Mapping gender
      let genderEnum = null;
      if (gender === "Laki-laki") {
        genderEnum = "Male";
      } else if (gender === "Perempuan") {
        genderEnum = "Female";
      }

      // Mapping education status
      const educationStatusMap = {
        0: "Siswa_Aktif__SMA_SMK_Sederajat_",
        1: "Lulusan_Baru___Gap_Year__Belum_Kuliah_",
        2: "Mahasiswa_Aktif",
        3: "Lainnya",
      };

      const updatedMentee = await prisma.mentee.update({
        where: {
          id: menteeId,
        },
        data: {
          username: fullName,
          email: email,
          gender: genderEnum,
          date_of_birth: dob ? new Date(dob) : null,
          province: valueProvince,
          city: valueCity,
          subdistrict: valueSubdistrict,
          ward: valueWard,
          education_status: educationStatusMap[educationStatus] || null,
          verify_status: true,
        },
      });

      return res.status(200).json({
        message: "Data profil berhasil diperbarui.",
        data: updatedMentee,
      });
    } catch (error) {
      console.error("Gagal memperbarui profil mentee:", error);
      if (error.code === "P2002") {
        return res.status(409).json({
          message: "Email sudah terdaftar.",
        });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  }
);

// check verif account
router.get(
  "/mentee/check-verify-status",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;

    try {
      const mentee = await prisma.mentee.findUnique({
        where: {
          id: menteeId,
        },
        select: {
          verify_status: true,
        },
      });

      return res.status(200).json({
        message: "Status verifikasi berhasil diambil.",
        data: mentee,
      });
    } catch (error) {
      console.error("Gagal mengambil status verifikasi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  }
);

// get mentee profile data
router.get(
  "/mentee/get-profile",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;

    try {
      const mentee = await prisma.mentee.findUnique({
        where: {
          id: menteeId,
        },
        select: {
          username: true,
          email: true,
          education_status: true,
          gender: true,
          date_of_birth: true,
          province: true,
          city: true,
          subdistrict: true,
          ward: true,
        },
      });

      return res.status(200).json({
        message: "Data profil mentee berhasil diambil.",
        data: mentee,
      });
    } catch (error) {
      console.error("Gagal mengambil data profil mentee:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  }
);

// edit mentee profile
router.put(
  "/mentee/edit-profile",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;
    const {
      fullName,
      gender,
      educationStatus,
      valueProvince,
      valueCity,
      valueSubdistrict,
      valueWard,
      dob,
    } = req.body;

    try {
      // Mapping gender
      let genderEnum = null;
      if (gender === "Laki-laki") {
        genderEnum = "Male";
      } else if (gender === "Perempuan") {
        genderEnum = "Female";
      } else {
        genderEnum = gender;
      }

      // Mapping education status
      const educationStatusMap = {
        0: "Siswa_Aktif__SMA_SMK_Sederajat_",
        1: "Lulusan_Baru___Gap_Year__Belum_Kuliah_",
        2: "Mahasiswa_Aktif",
        3: "Lainnya",
      };

      const updatedMentee = await prisma.mentee.update({
        where: {
          id: menteeId,
        },
        data: {
          username: fullName,
          gender: genderEnum,
          date_of_birth: dob ? new Date(dob) : null,
          province: valueProvince,
          city: valueCity,
          subdistrict: valueSubdistrict,
          ward: valueWard,
          education_status: educationStatusMap[educationStatus] || null,
          verify_status: true,
        },
      });

      return res.status(200).json({
        message: "Data profil berhasil diperbarui.",
        data: updatedMentee,
      });
    } catch (error) {
      console.error("Gagal memperbarui profil mentee:", error);
      if (error.code === "P2002") {
        return res.status(409).json({
          message: "Email sudah terdaftar.",
        });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  }
);

// save mentee major interest
router.post(
  "/mentee/save-major-interest",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;
    const { selectedMajors } = req.body;

    if (!selectedMajors || !Array.isArray(selectedMajors)) {
      return res.status(400).json({
        message:
          "Format data tidak valid. 'selectedMajors' harus berupa array.",
      });
    }

    try {
      const majorIds = selectedMajors
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));

      await prisma.$transaction(async (tx) => {
        // 1. Hapus data lama
        await tx.mentee_major_interest.deleteMany({
          where: {
            id_mentee: menteeId,
          },
        });

        // 2. Tambah data baru
        if (majorIds.length > 0) {
          const dataToInsert = majorIds.map((majorId) => ({
            id_mentee: menteeId,
            id_major: majorId,
          }));

          await tx.mentee_major_interest.createMany({
            data: dataToInsert,
          });
        }
      });

      return res.status(200).json({
        message: "Minat jurusan berhasil disimpan.",
        data: majorIds,
      });
    } catch (error) {
      console.error("Gagal menyimpan minat jurusan:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menyimpan minat jurusan.",
        error: error.message,
      });
    }
  }
);

// get mentee major interest
router.get(
  "/mentee/get-major-interest",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    const menteeId = req.user.id;

    try {
      const interests = await prisma.mentee_major_interest.findMany({
        where: {
          id_mentee: menteeId,
        },
        include: {
          standard_major: {
            select: {
              id: true,
            },
          },
        },
      });

      // Mengambil detail standard_major dari hasil query
      const data = interests.map((item) => item.id_major);

      return res.status(200).json({
        message: "Data minat jurusan berhasil diambil.",
        data: data,
      });
    } catch (error) {
      console.error("Gagal mengambil minat jurusan:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil minat jurusan.",
        error: error.message,
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
