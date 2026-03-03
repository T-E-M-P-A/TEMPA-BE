import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function createCertificate(userName) {
  try {
    // Load template
    const templatePath = path.resolve("./templates/template-sertif.pdf");
    const existingPdfBytes = fs.readFileSync(templatePath);

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

    // save File
    const pdfBytes = await pdfDoc.save();

    // console.log(`✅ Sertifikat berhasil dibuat: ${fileName}`);

    return pdfBytes;
  } catch (error) {
    console.error("❌ Error in createCertificate:", error);
    throw error;
  }
}
