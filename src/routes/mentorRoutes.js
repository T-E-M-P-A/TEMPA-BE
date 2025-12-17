import express from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

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

// get program by mentor id
router.get(
  "/get-mentor-programs",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;

    try {
      const programMentor = await prisma.program_mentor.findMany({
        where: {
          id_mentor: idMentor,
        },
        include: {
          program: {
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
            },
          },
        },
      });

      const formattedPrograms = programMentor.map((pm) => {
        const item = pm.program;
        const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

        const majorName =
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null;

        const newItem = {
          id: item.id,
          program_name: item.program_name,
          description: item.description,
          start_date: item.start_regis_date,
          end_date: item.end_regis_date,
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

      return res.status(200).json({
        message: "Berhasil mengambil data program mentor",
        data: formattedPrograms,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan server",
        error: error.message,
      });
    }
  }
);

// get detail program by id for mentor
router.get(
  "/get-detail-program/:id",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const idProgram = req.params.id;
    const parsedIdProgram = parseInt(idProgram);

    // Validasi ID Program
    if (isNaN(parsedIdProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    try {
      const detailProgram = await prisma.program.findFirst({
        where: {
          id: parsedIdProgram,
          program_mentor: {
            some: {
              id_mentor: idMentor,
            },
          },
        },
        include: {
          program_mentor: {
            where: {
              id_program: parsedIdProgram,
            },
            include: {
              mentor: {
                select: {
                  id: true,
                  name: true,
                  nik: true,
                  mentor_type: true,
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
          message:
            "Program tidak ditemukan atau Anda tidak terdaftar sebagai mentor di program ini.",
        });
      }

      const item = detailProgram;

      // FORMAT PATH GAMBAR PROGRAM UTAMA
      const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);
      const formattedMateriList = item.materi.map((materi) => ({
        ...materi,
        // Lakukan mapping pada materi_resource
        materi_resource: materi.materi_resource.map((resource) => {
          const newItem = {
            ...resource,
            resource_url:
              resource.type === "kuis" || resource.type === "video"
                ? resource.path_file
                : formatPathToUrl(resource.path_file, BASE_URL),
          };
          delete newItem.path_file;
          return newItem;
        }),
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
        mentor_list: item.program_mentor.map((pm) => ({
          id: pm.id,
          mentor_id: pm.mentor?.id,
          name: pm.mentor?.name,
          nik: pm.mentor?.nik,
          mentor_type: pm.mentor?.mentor_type,
        })),
      };

      // Bersihkan properti yang tidak diperlukan lagi (opsional)
      delete formattedDetail.path_gambar;
      delete formattedDetail.program_mentor;
      delete formattedDetail.id_campus;
      delete formattedDetail.id_mentor;
      delete formattedDetail.id_session_type;
      delete formattedDetail.campus_program_id_majorTocampus;
      delete formattedDetail._count;
      // Hapus mentee_progress mentah yang sudah dipetakan
      delete formattedDetail.mentee_progress;
      delete formattedDetail.materi; // Hapus materi mentah

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
