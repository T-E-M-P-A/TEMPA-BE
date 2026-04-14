import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function createCertificate(
  userName,
  startProgramDate,
  endProgramDate,
  campusName,
) {
  try {
    let textBody = `Diberikan atas penyelesaian program Trial Perkuliahan di ${campusName}, sebagai bentuk apresiasi atas dedikasi dalam mengeksplorasi potensi akademik.`;

    // format date
    const formatDateIndo = (dateString) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(date);
    };

    const startFormated = formatDateIndo(startProgramDate);
    const endFormated = formatDateIndo(endProgramDate);

    const periodText = `${startFormated} – ${endFormated}`;

    // Load template
    const templatePath = path.resolve("./templates/template-sertif1.pdf");
    const existingPdfBytes = fs.readFileSync(templatePath);

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const fontBold = await pdfDoc.embedFont("Helvetica-Bold");
    const fontRegular = await pdfDoc.embedFont("Helvetica");

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // mentee name
    firstPage.drawText(userName, {
      x: 59,
      y: 375,
      size: 60,
      font: await pdfDoc.embedFont("Helvetica-Bold"),
      color: rgb(0, 0, 0),
    });

    // apresiasi text
    firstPage.drawText(textBody, {
      x: 59,
      y: 305,
      size: 14,
      font: fontRegular,
      color: rgb(16 / 255, 17 / 255, 18 / 255),
      maxWidth: 500,
      lineHeight: 18,
    });

    // periode text
    firstPage.drawText(periodText, {
      x: 59,
      y: 200,
      size: 14,
      font: fontBold,
      color: rgb(16 / 255, 17 / 255, 18 / 255),
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
