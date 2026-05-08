import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../../prisma/client.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import multer from "multer";
import fs from "fs";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import mailQueue from "../lib/mailQueue.js";
import generateCertificateDelayQueue from "../lib/generateCertificate.js";
import generateCertificateFifo from "../lib/sendCertificateFifo.js";

const router = express.Router();

// generate certificate
router.post("/generate-certificate", async (req, res) => {
  const { menteeId, idProgram, idCampus } = req.body;

  // get 1000 mentee
  const targetMentees = await prisma.mentee.findMany({
    take: 1000, // Mengambil 1.000 data sesuai beban kerja eksperimen
    select: { id: true, username: true, email: true },
  });

  // get campus name
  const campus = await prisma.campus.findUnique({
    where: { id: idCampus },
    select: { campus_name: true },
  });

  // get program name
  const getProgram = await prisma.program.findUnique({
    where: {
      id: idProgram,
    },
    select: {
      start_program_date: true,
      end_program_date: true,
    },
  });
  const campusName = campus?.campus_name || "Campus Team";

  targetMentees.forEach((mentee) => {
    // FIFO
    generateCertificateFifo
      .push({
        ...mentee,
        campusName: campusName,
        idProgram: idProgram,
        startProgramDate: getProgram?.start_program_date,
        endProgramDate: getProgram?.end_program_date,
      })
      .catch((err) =>
        console.error(`Gagal masuk antrean untuk ${mentee.username}:`, err),
      );
    // delay queue
    // generateCertificateDelayQueue
    //   .push({
    //     ...mentee,
    //     campusName: campusName,
    //     idProgram: idProgram,
    //     startProgramDate: getProgram?.start_program_date,
    //     endProgramDate: getProgram?.end_program_date,
    //   })
    //   .catch((err) =>
    //     console.error(`Gagal masuk antrean untuk ${mentee.username}:`, err),
    //   );
  });

  res.send({
    status: "success",
    message: `${menteesWithFeedback.length} dari ${menteeId.length} sertifikat berhasil diproses. Sisanya belum mengisi feedback.`,
  });
});

export default router;
