import express from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { findOrCreateUser } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";

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
          sesi_program: true,
          campus_program_id_campusTocampus: true,
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
              campus_name: true,
              address: true,
              email: true,
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

      const formatGetDetailProgram = { ...item };

      delete formatGetDetailProgram.path_gambar;

      formatGetDetailProgram.image_url = imageUrl;

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
