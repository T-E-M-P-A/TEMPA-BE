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
  menteeController.checkVerifyStatus,
);

// get mentee profile data
router.get(
  "/mentee/get-profile",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getProfileMentee,
);

// edit mentee profile
router.put(
  "/mentee/edit-profile",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.editProfileMentee,
);

// save mentee major interest
router.post(
  "/mentee/save-major-interest",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.majorInterest,
);

// get mentee major interest
router.get(
  "/mentee/get-major-interest",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getMajorInterest,
);

// add seen every mentee see detail program
router.post(
  "/mentee/add-seen-program/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.addSeenProgram,
);

// add seen every mentee see detail campus
router.post(
  "/mentee/add-seen-campus/:idCampus",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.addSeenCampus,
);

// get presensi mentee
router.get(
  "/mentee/presensi/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.getPresensi,
);

// submit-presensi
router.post(
  "/mentee/submit-presensi/:idProgram",
  authenticateUser,
  authorizeRoles(["mentee"]),
  menteeController.submiPresensi,
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
