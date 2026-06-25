import fastq from "fastq";
import { createCertificate } from "./createCertificate.js";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { sendEmailWithAttachment } from "./templateEmail.js";

// Send certificate using FIFO
const workerFIFO = async (task) => {
  try {
    console.log(`[FIFO] Processing: ${task.username}`);

    // generate certificate
    const pdfBytes = await createCertificate(
      task.username,
      task.startProgramDate,
      task.endProgramDate,
      task.campusName,
    );

    const pdfBuffer = Buffer.from(pdfBytes);

    // get logo
    const logoPath = path.join(process.cwd(), "assets", "logo-text.png");
    const attachments = [
      {
        filename: `Sertifikat_${task.username.replace(/\s+/g, "_")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];
    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: "logo-text.png",
        path: logoPath,
        cid: "logoTempa",
      });
    }

    // send email
    await sendEmailWithAttachment(task, attachments, logoPath);

    return `Done: ${task.username}`;
  } catch (err) {
    console.error(`[FIFO] Gagal permanen untuk ${task.username}:`, err.message);
    throw err;
  }
};

const generateCertificateFifo = fastq.promise(workerFIFO, 2);

export default generateCertificateFifo;
