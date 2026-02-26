import express from "express";
import { findOrCreateUser } from "../controllers/findOrCreateUser.js";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import prisma from "../../prisma/client.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import generateContentWithRetry from "../controllers/generateContentWithRetry.js";
import * as menteeController from "../controllers/menteeController.js";

const CLIENT_ID = process.env.CLIENT_ID;
const BASE_URL = process.env.API_BASE_URL;

const router = express.Router();

// Oauth mentee with google
router.post("/login-mentee", menteeController.loginMentee);

// get the program that the mentee has registered for
router.get(
  "/mentee/get-program-mentee",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getProgramMentee,
);

// get all program
router.get(
  "/mentee/all-program",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getAllProgram,
);

// get detail program
router.get(
  "/mentee/detail-program/:id",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.detailProgram,
);

// get all campus
router.get(
  "/mentee/all-campus",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getAllCampus,
);

// get detail campus
router.get(
  "/mentee/detail-campus/:id",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.detailCampus,
);

// register program for mentee
router.post(
  "/mentee/register-program/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.registerProgram,
);

// get majors
router.get(
  "/mentee/all-majors",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getMajors,
);

// get detail majors
router.get(
  "/mentee/detail-major/:majorName",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.detailMajor,
);

// recomendation majors
router.post(
  "/mentee/recomendation-major",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.recomendationMajors,
);

// get response ai from databse if mentee already assign form
router.get(
  "/mentee/get-response",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getResponseAi,
);

// get materi mentee
// router.get(
//   "/mentee/get-materi/:id_program",
//   authenticateUser,
//   authorizeRoles(["mentee"]),
//   async (req, res) => {
//     // Pastikan idProgram adalah integer
//     const idProgram = parseInt(req.params.id_program);
//     const idMentee = parseInt(req.user.id);

//     // Cek apakah parsing berhasil
//     if (isNaN(idProgram)) {
//       return res.status(400).json({
//         message: "ID Program tidak valid.",
//       });
//     }

//     try {
//       const getProgramStatus = await prisma.mentee_progress.findFirst({
//         where: {
//           id_mentee: idMentee,
//           id_program: idProgram,
//         },
//         select: {
//           completion_status: true,
//         },
//       });
//       // 1. UPDATE Kueri Prisma: Sertakan relasi 'materi_resource'
//       const materiList = await prisma.materi.findMany({
//         where: {
//           id_program: idProgram,
//           visibility: "public",
//         },
//         include: {
//           program: {
//             select: {
//               program_name: true,
//               description: true,
//               start_program_date: true,
//               end_program_date: true,
//             },
//           },
//           // Sertakan semua resource (file/video/kuis) untuk setiap materi
//           materi_resource: true,
//         },
//         orderBy: {
//           create_at: "asc",
//         },
//       });

//       if (materiList.length === 0) {
//         // Ambil detail program secara terpisah
//         const programData = await prisma.program.findUnique({
//           where: {
//             id: idProgram,
//           },
//           select: {
//             program_name: true,
//             description: true,
//             end_program_date: true,
//             start_program_date: true,
//           },
//         });

//         // Cek jika program itu sendiri tidak ditemukan
//         if (!programData) {
//           return res.status(404).json({
//             message: "Program tidak ditemukan.",
//           });
//         }

//         // Jika program ditemukan tapi materinya kosong, kirim detail program dengan array materi kosong
//         return res.status(200).json({
//           message: "Materi belum ditambahkan untuk program ini.",
//           // Kirim data yang dibutuhkan frontend untuk header
//           data: [
//             {
//               completion_status:
//                 getProgramStatus?.completion_status || "on_going",
//               program_name: programData.program_name,
//               program_description: programData.description,
//               end_program_date: programData.end_program_date,
//               start_program_date: programData.start_program_date,
//               resources: [],
//               // Berikan properti materi minimal agar frontend bisa membaca
//               title: null,
//               description: null,
//               id: null,
//             },
//           ],
//         });
//       }

//       // 2. UPDATE Logika Pemformatan: Pindahkan path_file ke resource
//       const formattedMateriPath = materiList.map((item) => {
//         // Ambil data program untuk dipindahkan ke tingkat atas
//         const { program, materi_resource, ...materiData } = item;

//         // Map dan format path_file untuk SETIAP resource
//         const formattedResources = materi_resource.map((resource) => {
//           const rawPathFile = resource.path_file;
//           const fileUrl = formatPathToUrl(rawPathFile, BASE_URL);

//           return {
//             ...resource,
//             file_url: fileUrl, // Tambahkan URL yang sudah diformat
//             // Hapus path_file mentah dari objek resource jika perlu
//             // delete resource.path_file;
//           };
//         });

//         // Gabungkan semua data yang dibutuhkan
//         const newItem = {
//           ...materiData,
//           completion_status: getProgramStatus?.completion_status || "on_going",
//           program_name: program.program_name,
//           program_description: program.description,
//           end_program_date: program.end_program_date,
//           start_program_date: program.start_program_date,
//           resources: formattedResources, // Masukkan resource yang sudah diformat
//         };

//         // Hapus objek program yang sudah diekstrak
//         delete newItem.program;

//         return newItem;
//       });

//       console.log(formattedMateriPath);

//       // 3. Beri respons sukses
//       return res.status(200).json({
//         message: `Materi untuk program ID ${idProgram} berhasil didapatkan`,
//         data: formattedMateriPath,
//       });
//     } catch (error) {
//       console.error("Gagal mengambil materi:", error);

//       // 4. Tangani error database atau server
//       return res.status(500).json({
//         message: "Terjadi kesalahan saat mengambil data materi.",
//         error: error.message,
//       });
//     }
//   },
// );

// get materi mentee
router.get(
  "/mentee/get-materi/:id_program",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getMateri,
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
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
  },
);

// add seen every mentee see detail program
router.post(
  "/mentee/add-seen-program/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    // console.log(req.user.id);

    const menteeId = req.user.id;
    const { idProgram } = req.params;
    const idProgramInt = parseInt(idProgram);

    if (isNaN(idProgramInt)) {
      return res.status(400).json({ message: "ID Program tidak valid." });
    }

    try {
      // check log in table view_log_program if mentee never seen the program
      const existingLog = await prisma.view_log_program.findFirst({
        where: {
          id_program: idProgramInt,
          id_mentee: menteeId,
        },
      });

      if (!existingLog) {
        // add idMentee and idProgram if mentee seen program
        await prisma.$transaction([
          prisma.view_log_program.create({
            data: {
              id_program: idProgramInt,
              id_mentee: menteeId,
            },
          }),
          // update atribut seen
          prisma.program.update({
            where: { id: idProgramInt },
            data: { seen: { increment: 1 } },
          }),
        ]);
      }

      return res
        .status(200)
        .json({ message: "Berhasil mencatat view program." });
    } catch (error) {
      console.error("Gagal mencatat view program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  },
);

// add seen every mentee see detail campus
router.post(
  "/mentee/add-seen-campus/:idCampus",
  authenticateUser,
  authorizeRoles(["mentee"]),
  async (req, res) => {
    // console.log(req.user.id);

    const menteeId = req.user.id;
    const idCampus = parseInt(req.params.idCampus);

    if (isNaN(idCampus)) {
      return res.status(400).json({ message: "ID Kampus tidak valid." });
    }

    try {
      // check log in table view_log_program if mentee never seen the program
      const existingLog = await prisma.view_log_campus.findFirst({
        where: {
          id_campus: idCampus,
          id_mentee: menteeId,
        },
      });

      if (!existingLog) {
        // add idMentee and idCampus if mentee seen campus detail page
        await prisma.$transaction([
          prisma.view_log_campus.create({
            data: {
              id_campus: idCampus,
              id_mentee: menteeId,
            },
          }),
          // update atribut seen
          prisma.campus.update({
            where: { id: idCampus },
            data: { seen: { increment: 1 } },
          }),
        ]);
      }

      return res
        .status(200)
        .json({ message: "Berhasil mencatat view kampus." });
    } catch (error) {
      console.error("Gagal mencatat view kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server.",
        error: error.message,
      });
    }
  },
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
  },
);

export default router;
