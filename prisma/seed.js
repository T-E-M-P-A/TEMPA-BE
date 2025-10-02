const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function seed() {
  const adminUsername = "superadmin";
  const rawPassword = "password123";
  const saltRounds = 10;

  try {
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    const adminUser = await prisma.admin.upsert({
      where: { username: adminUsername },
      update: {
        password: hashedPassword,
      },
      create: {
        username: adminUsername,
        password: hashedPassword,
      },
    });

    console.log(
      `Seeding admin berhasil: User ${adminUser.username} telah ditambahkan/diperbarui.`
    );
  } catch (e) {
    console.error("Gagal melakukan seeding:", e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
