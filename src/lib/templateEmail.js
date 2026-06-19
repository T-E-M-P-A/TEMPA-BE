import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";

const transporter = nodemailer.createTransport({
  host: "localhost", // atau '127.0.0.1'
  port: 1025, // Port SMTP dari Mailpit
  secure: false,
});

// send email with attachment from buffer
export const sendEmailWithAttachment = async (task, attachments, logoPath) => {
  try {
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
  } catch (err) {
    throw err; // Throw an error to let fastq know the process failed
  }
};
