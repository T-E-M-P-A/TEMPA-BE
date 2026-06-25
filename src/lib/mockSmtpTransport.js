import nodemailer from "nodemailer";

// Anggap ini transporter asli ke Mailpit
const realTransport = nodemailer.createTransport({
  host: "localhost",
  port: 1025, // Port Mailpit
  ignoreTLS: true,
});

let sentInWindow = 0;
let windowStartTime = Date.now(); // KUNCI PERBAIKAN: Variabel pelacak waktu
let blockUntil = 0;

export const mockTransport = {
  sendMail: async (mailOptions) => {
    const now = Date.now();

    // 1. Cek apakah sedang dalam masa blokir (Sustained Block)
    if (now < blockUntil) {
      const err = new Error(
        "421 4.7.0 Temporary System Problem. IP temporarily blocked.",
      );
      err.responseCode = 421;
      throw err;
    }

    // 2. Reset hitungan jika sudah lewat 1 detik dari waktu mulai
    if (now - windowStartTime > 1000) {
      windowStartTime = now; // Reset patokan waktu ke sekarang
      sentInWindow = 0; // Reset counter email ke 0
    }

    // 3. Simulasi: Jika sudah kirim 5 email dalam 1 detik, blokir selama 15 detik!
    if (sentInWindow >= 5) {
      blockUntil = now + 15000;
      sentInWindow = 0;
      const err = new Error("429 4.7.0 Too many connections. Try again later.");
      err.responseCode = 429;
      throw err;
    }

    // 4. Jika aman, tambah counter dan kirim ke Mailpit asli
    sentInWindow++;
    return realTransport.sendMail(mailOptions);
  },
};
