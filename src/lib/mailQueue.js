import fastq from "fastq";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";

// Inisialisasi Transporter (Re-use satu koneksi)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Fungsi Worker yang memproses setiap email dalam antrean
const sendEmailWorker = async (task) => {
  const { menteeEmail, menteeUsername, campusName, subject, message } = task;

  const logoPath = path.join(process.cwd(), "assets", "logo-text.png");
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: "logo-text.png",
      path: logoPath,
      cid: "logoTempa",
    });
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: menteeEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            ${
              fs.existsSync(logoPath)
                ? '<img src="cid:logoTempa" alt="TEMPA Logo" style="max-width: 150px; height: auto;" />'
                : "<h2>TEMPA</h2>"
            }
          </div>
          <h2 style="color: #333; text-align: center;">Pesan Baru dari ${campusName}</h2>
          <p style="font-size: 16px; color: #555;">Halo <strong>${menteeUsername}</strong>,</p>
          <p style="font-size: 16px; color: #555;">Anda menerima pesan baru:</p>
          <div style="background-color: #f9f9f9; border-left: 5px solid #013B35; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #013B35;">${subject}</p>
            <p style="margin: 5px 0 0; color: #555;">${message}</p>
          </div>
          <p style="font-size: 16px; color: #555;">Salam hangat,<br><strong>${campusName}</strong></p>
        </div>
      `,
      attachments: attachments,
    });
    console.log(`[Queue Success] Email terkirim ke: ${menteeEmail}`);
  } catch (error) {
    console.error(
      `[Queue Error] Gagal mengirim ke ${menteeEmail}:`,
      error.message
    );
    // Di sini Anda bisa menambahkan logika retry jika perlu
  }
};

// Buat antrean dengan concurrency 2 (mengirim 2 email sekaligus secara paralel)
const mailQueue = fastq.promise(sendEmailWorker, 2);

export default mailQueue;
