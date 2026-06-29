import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

async function seedMentee() {
  console.log("Memulai proses seeding 1.000 mentee...");

  const mentees = [];

  // Loop untuk membuat 1.000 data dummy
  for (let i = 0; i < 20; i++) {
    mentees.push({
      // sub_google_id harus unik
      sub_google_id: faker.string.uuid(),
      username: faker.internet.username(),
      // Email unik yang akan ditangkap oleh Mailtrap/Monitoring Layer
      email: faker.internet.email(),
      password: null, // Sesuai skema (opsional)
      verify_status: true, // Kita set true untuk simulasi siswa aktif
      province: faker.location.state(),
      city: faker.location.city(),
      subdistrict: faker.location.county(),
      ward: faker.location.direction(),
      date_of_birth: faker.date.birthdate({ min: 15, max: 20, mode: "age" }),
    });
  }

  try {
    // Menggunakan createMany agar proses input ke MySQL sangat cepat
    const result = await prisma.mentee.createMany({
      data: mentees,
      skipDuplicates: true, // Menghindari error jika ada email yang bentrok
    });

    console.log(
      `[SUKSES] Berhasil memasukkan ${result.count} data mentee ke database.`,
    );
    console.log(
      `Gunakan data ini untuk pengujian Scenario I (FIFO) 1.000 email.`,
    );
  } catch (error) {
    console.error("[GAGAL] Terjadi kesalahan saat seeding:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedMentee();
