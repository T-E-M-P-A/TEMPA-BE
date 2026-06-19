import fastq from "fastq";
import { createCertificate } from "./createCertificate.js";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { sendEmailWithAttachment } from "./templateEmail.js";

const transporter = nodemailer.createTransport({
  host: "localhost",
  port: 1025,
  secure: false,
});

const MAX_RETRIES = 5;
const BASE_DELAY = 2000; // 2 second

// Worker function using delay queue and exponantial backtoff
const worker = async (task) => {
  task.retryCount = task.retryCount || 0;
  try {
    console.log(`[PROCESS] ${task.username} - Percobaan: ${task.retryCount}`);

    // Generate certificate
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

    // template email
    await sendEmailWithAttachment(task, attachments, logoPath);
    return `Done: ${task.username}`;
  } catch (err) {
    // check error rate limit (429 or 451)
    const isRateLimit =
      err.responseCode === 429 ||
      err.responseCode === 451 ||
      err.message.includes("limit");

    if (isRateLimit && task.retryCount < MAX_RETRIES) {
      task.retryCount++;

      // Formula Exponential Backoff: delay * 2^retryCount
      const delay = BASE_DELAY * Math.pow(2, task.retryCount);

      console.warn(
        `[RATE LIMIT] ${task.username} tertunda. Percobaan ke-${task.retryCount}. Tunggu ${delay}ms`,
      );

      // delay and send again
      await new Promise((resolve) => setTimeout(resolve, delay));

      // (Re-queue)
      return generateCertificateDelayQueue.push(task);
    } else {
      console.error(`[FATAL] Gagal memproses ${task.username}:`, err.message);
      throw err;
    }
  }
};

// Queue initialization (Concurrency: 2 means 2 certificates are processed at once)
const generateCertificateDelayQueue = fastq.promise(worker, 2);

export default generateCertificateDelayQueue;
