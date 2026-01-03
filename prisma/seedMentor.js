// const { PrismaClient } = require("@prisma/client");
import { PrismaClient } from "@prisma/client";
// const bcrypt = require("bcrypt");
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function seedMentor() {
  const nik = 123456789;
  const mentorUsername = "ririn";
  const rawPassword = "123456789";
  const saltRounds = 10;

  try {
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    const userMentor = await prisma.mentor.upsert({
      where: { nik: nik },
      update: {
        password: hashedPassword,
      },
      create: {
        nik: nik,
        name: mentorUsername,
        id_campus: 1,
        id_major: 1,
        password: hashedPassword,
      },
    });

    console.log(
      `Seeding mentor berhasil: User ${userMentor.name} telah ditambahkan/diperbarui.`
    );
  } catch (e) {
    console.error("Gagal melakukan seeding:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedMentor();
