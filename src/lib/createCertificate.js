// src/lib/createCertificate.js
import { PDFDocument, rgb } from "pdf-lib"; // Gunakan kurung kurawal { }
import fs from "fs";
import path from "path";

export async function createCertificate(userName) {
  try {
    // 1. Load template
    // Gunakan path absolut agar lebih aman saat dijalankan dari worker
    const templatePath = path.resolve("./templates/template-sertif.pdf");
    const existingPdfBytes = fs.readFileSync(templatePath);

    // Sekarang PDFDocument.load akan berfungsi karena diimpor dengan benar
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    firstPage.drawText(userName, {
      x: 59,
      y: 375,
      size: 60,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      color: rgb(0, 0, 0),
    });

    // 3. Simpan File
    const pdfBytes = await pdfDoc.save();

    // Pastikan folder output ada
    const outputDir = path.resolve("./output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `sertifikat_${userName.replace(/\s+/g, "_")}.pdf`;
    fs.writeFileSync(path.join(outputDir, fileName), pdfBytes);

    // console.log(`✅ Sertifikat berhasil dibuat: ${fileName}`);
  } catch (error) {
    console.error("❌ Error in createCertificate:", error);
    throw error;
  }
}
