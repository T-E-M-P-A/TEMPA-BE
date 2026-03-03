import fastq from "fastq";
import { createCertificate } from "./createCertificate.js";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const worker = async (task) => {
  try {
    // console.log(`Processing: ${task.username}`);
    // Generate PDF Bytes (Memory Only)
    const pdfBytes = await createCertificate(task.username);
    const pdfBuffer = Buffer.from(pdfBytes); // Konversi ke Node.js Buffer

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

    // send email with attachment from buffer
    await transporter.sendMail({
      from: '"Campus Team" <no-reply@yourcampus.id>',
      to: task.email,
      subject: `Sertifikat Kelulusan - ${task.username}`,
      html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 20px;">
                  ${
                    fs.existsSync(logoPath)
                      ? '<img src="cid:logoTempa" alt="TEMPA Logo" style="max-width: 150px; height: auto;" />'
                      : "<h2>TEMPA</h2>"
                  }
                </div>
                <h2 style="color: #333; text-align: center;">Pesan Baru dari ${task.campusName}</h2>
                <p style="font-size: 16px; color: #555;">Halo <strong>${task.username}</strong>,</p>
                <p style="font-size: 16px; color: #555;">Anda menerima pesan baru:</p>
                <div style="background-color: #f9f9f9; border-left: 5px solid #013B35; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold; color: #013B35;">Sertifikat Kelulusan - ${task.username}</p>
                  <p style="margin: 5px 0 0; color: #555;">Halo ${task.username}, selamat atas kelulusan Anda! Terlampir adalah sertifikat Anda.</p>
                </div>
                <p style="font-size: 16px; color: #555;">Salam hangat,<br><strong>${task.campusName}</strong></p>
              </div>
            `,
      attachments: attachments,
    });
    return `Done: ${task.username}`;
  } catch (err) {
    console.error(`Processing Failed for ${task.username}:`, err);
    throw err; // Throw an error to let fastq know the process failed
  }
};

// Queue initialization (Concurrency: 2 means 2 certificates are processed at once)
const generateCertificateQueue = fastq.promise(worker, 2);

export default generateCertificateQueue;
