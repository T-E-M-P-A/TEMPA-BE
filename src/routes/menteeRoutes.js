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
  menteeController.giveFeedbackProgram,
);

// verify mentee
router.put(
  "/mentee/verify-mentee",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.verifyMentee,
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
