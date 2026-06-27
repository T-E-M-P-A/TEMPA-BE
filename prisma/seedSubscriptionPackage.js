import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const subscriptionPackages = [
    {
      id: 1,
      package_name: "TEMPA Berkembang",
      logo_name: "TrendingUp",
      price: 5000000,
      benefit: [
        {
          desc: "Kapasitas pendaftaran hingga 100 siswa yang terbagi dalam 5 program unggulan.",
          title: "Kapasitas 100 Siswa",
        },
        {
          desc: "Saldo otomatis tersedia untuk subsidi pendaftaran siswa (Rp15.000/siswa).",
          title: "Deposit Pendaftaran Rp1,5 Juta",
        },
        {
          desc: "Kelola dan publikasikan hingga 5 program trial kampus secara sistematis.",
          title: "Publikasi 5 Program",
        },
        {
          desc: "Sistem otomatisasi pemberian sertifikat digital bagi siswa yang menyelesaikan program.",
          title: "Sertifikat Digital Otomatis",
        },
        {
          desc: "Pantau data pengunjung, minat program, dan konversi calon mahasiswa secara real-time.",
          title: "Statistik & Monitoring Dasar",
        },
      ],
      duration_month: 6,
      description:
        "Membangun kehadiran digital dan mengenalkan kurikulum secara luas.",
      sub_heading: "Presence & Growth",
      free_trial: false,
      isPopular: false,
      id_admin: 1,
    },
    {
      id: 2,
      package_name: "TEMPA Eksklusif",
      logo_name: "Crown",
      price: 6000000,
      benefit: [
        {
          desc: "Kuota pendaftaran lebih luas hingga 125 siswa untuk 6 program unggulan.",
          title: "Kapasitas 125 Siswa",
        },
        {
          desc: "Saldo subsidi pendaftaran siswa (Rp20.000/siswa) untuk efisiensi biaya.",
          title: "Deposit Pendaftaran Rp2,5 Juta",
        },
        {
          desc: "Akses kontak email peserta dan data demografi detail untuk follow-up mahasiswa baru.",
          title: "Database Leads & Analitik",
        },
        {
          desc: "Label eksklusif pada profil kampus untuk membangun kepercayaan instan di mata calon mahasiswa.",
          title: "Badge Terverifikasi",
        },
        {
          desc: "Kebebasan unggah materi kurikulum dan program trial tanpa batasan kuota sistem.",
          title: "Interaksi Tanpa Batas",
        },
      ],
      duration_month: 6,
      description:
        "Konversi maksimal dengan pengambilan keputusan berbasis data analitik.",
      sub_heading: "Conversion & Data-Driven",
      free_trial: false,
      isPopular: true,
      id_admin: 1,
    },
  ];

  for (const pkg of subscriptionPackages) {
    await prisma.subscription_package.upsert({
      where: { id: pkg.id },
      update: pkg,
      create: pkg,
    });
  }

  console.log("Seed data berhasil dimasukkan!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
