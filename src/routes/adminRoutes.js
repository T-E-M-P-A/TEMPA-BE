import express, { json } from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import nodemailer from "nodemailer";
import path from "path";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

// login admin
router.post("/admin-login", async (req, res) => {
  const { username, password } = req.body;

  //   check if username and password null
  if (!username || !password) {
    return res.status(400).json({
      message: "Username or Password not found!",
    });
  }

  try {
    // search username admin
    const admin = await prisma.admin.findUnique({
      where: {
        username: username,
      },
    });

    // if username not found
    if (!admin) {
      return res.status(401).json({
        message: "Username tidak ditemukan!",
      });
    }

    // validation password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    // if password worng
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Kata sandi salah!",
      });
    }

    // sign JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: "admin",
      },
      JWT_SECRET,
      { expiresIn: "1d" } // expired in 1 day
    );

    return res.status(200).json({
      message: "Login admin berhasil",
      token: token,
      adminId: admin.id,
    });
  } catch (error) {
    console.error("Kesalahan saat login admin:", error);
    return res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
});

// get dashboard data for admin (total campus, program, mentee, and chart data)
router.get(
  "/get-dashboard-data",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      // Menggunakan Promise.all untuk efisiensi query paralel
      const [totalCampus, totalProgram, totalMentee, campusPrograms] =
        await Promise.all([
          // 1. Total Campus Accepted
          prisma.campus.count({
            where: {
              verification_status: "accepted",
            },
          }),
          // 2. Total Program
          prisma.program.count(),
          // 3. Total Mentee
          prisma.mentee.count(),
          // 4. Data Kampus untuk Chart (Jumlah Program per Kampus)
          prisma.campus.findMany({
            where: {
              verification_status: "accepted",
            },
            select: {
              campus_name: true,
              _count: {
                select: {
                  program_program_id_campusTocampus: true, // Relasi ke tabel program
                },
              },
            },
          }),
        ]);

      // Format data untuk chart
      const chartData = campusPrograms.map((item) => ({
        campus_name: item.campus_name,
        total_program: item._count.program_program_id_campusTocampus,
      }));

      return res.status(200).json({
        message: "Data dashboard berhasil diambil",
        data: {
          total_campus_accepted: totalCampus,
          total_program: totalProgram,
          total_mentee: totalMentee,
          program_per_campus: chartData,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan saat mengambil data dashboard",
        error: error.message,
      });
    }
  }
);

// get all campus data for admin
router.get(
  "/get-all-campus",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const allCampus = await prisma.campus.findMany({
        select: {
          id: true,
          campus_name: true,
          path_logo: true,
          verification_status: true,
        },
        orderBy: {
          campus_name: "asc",
        },
      });

      const formattedCampus = allCampus.map((campus) => ({
        id: campus.id,
        campus_name: campus.campus_name,
        verification_status: campus.verification_status,
        logo_url: formatPathToUrl(campus.path_logo, BASE_URL),
      }));

      return res.status(200).json({
        message: "Data kampus berhasil diambil",
        data: formattedCampus,
      });
    } catch (error) {
      console.error("Gagal mengambil data kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data kampus",
        error: error.message,
      });
    }
  }
);

// get all mentee data for admin
router.get(
  "/get-all-mentee",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const allMentee = await prisma.mentee.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          mentee_progress: {
            select: {
              completion_status: true,
              completion_date: true,
              program: {
                select: {
                  id: true,
                  program_name: true,
                },
              },
            },
          },
        },
        orderBy: {
          username: "asc",
        },
      });

      const formattedMentee = allMentee.map((mentee) => ({
        id: mentee.id,
        username: mentee.username,
        email: mentee.email,
        status: mentee.status,
        registered_programs: mentee.mentee_progress.map((mp) => ({
          program_name: mp.program?.program_name,
          completion_status: mp.completion_status,
          completion_date: mp.completion_date,
        })),
      }));

      return res.status(200).json({
        message: "Data mentee berhasil diambil",
        data: formattedMentee,
      });
    } catch (error) {
      console.error("Gagal mengambil data mentee:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data mentee",
        error: error.message,
      });
    }
  }
);

// get detail campus by id for admin
router.get(
  "/get-detail-verification-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    try {
      const campus = await prisma.campus.findUnique({
        where: {
          id: idCampus,
        },
        select: {
          id: true,
          campus_name: true,
          email_campus: true,
          description: true,
          website_campus: true,
          province: true,
          city: true,
          subdistrict: true,
          ward: true,
          lat: true,
          lng: true,
        },
      });

      if (!campus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      return res.status(200).json({
        message: "Detail kampus berhasil diambil",
        data: campus,
      });
    } catch (error) {
      console.error("Gagal mengambil detail kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil detail kampus",
        error: error.message,
      });
    }
  }
);

// get detail campus
router.get(
  "/detail-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const idCampus = req.params.id;

      const detailCampus = await prisma.campus.findUnique({
        where: {
          id: parseInt(idCampus),
        },
        select: {
          id: true,
          campus_name: true,
          email: true,
          path_logo: true,
          path_banner: true,
          address: true,
          description: true,
          verification_status: true,
          sub_google_id: false,
          vision_mission: true,
          password: false,

          program_program_id_campusTocampus: {
            where: {
              visibility: "public",
            },
            select: {
              id: true,
              program_name: true,
              path_gambar: true,
              description: true,
              capacity: true,
              type_sesi: true,
              start_regis_date: true,
              end_regis_date: true,
              start_program_date: true,
              end_program_date: true,
              onsiteLocationName: true,
              campus_program_id_majorTocampus: {
                include: {
                  standard_major: {
                    select: {
                      major_name: true,
                    },
                  },
                },
              },
            },
          },
          major: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      if (!detailCampus) {
        return res.status(404).json({ message: "Kampus tidak ditemukan." });
      }

      let formattedCampus = { ...detailCampus };

      // delete old path_logo and add new url logo_url
      formattedCampus.logo_url = formatPathToUrl(
        formattedCampus.path_logo,
        BASE_URL
      );
      delete formattedCampus.path_logo;

      // delete old path_banner and add new url banner_url
      formattedCampus.banner_url = formatPathToUrl(
        formattedCampus.path_banner,
        BASE_URL
      );
      delete formattedCampus.path_banner;

      // 🏆 3. FORMAT PATH GAMBAR DI DALAM RELASI PROGRAM (jika ada)
      if (formattedCampus.program_program_id_campusTocampus) {
        formattedCampus.program_program_id_campusTocampus =
          formattedCampus.program_program_id_campusTocampus.map((program) => {
            // Duplikasi objek program
            let formattedProgram = { ...program };

            // Format path_gambar program dan hapus path lama
            formattedProgram.image_url = formatPathToUrl(
              formattedProgram.path_gambar,
              BASE_URL
            );
            delete formattedProgram.path_gambar;

            return formattedProgram;
          });
      }

      console.log(formattedCampus);

      return res.status(200).json({
        message: "Detail campus ditemukan",
        data: formattedCampus,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(404)
        .json({ message: "Not Found due to internal error." });
    }
  }
);

// update verification status campus to accepted
router.put(
  "/accept-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    try {
      // Cek keberadaan kampus
      const existingCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
      });

      if (!existingCampus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      // Update status menjadi accepted
      const updatedCampus = await prisma.campus.update({
        where: {
          id: idCampus,
        },
        data: {
          verification_status: "accepted",
        },
      });

      return res.status(200).json({
        message: "Status verifikasi kampus berhasil diubah menjadi accepted",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal mengubah status kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengubah status kampus",
        error: error.message,
      });
    }
  }
);

// reject campus and send email notification
router.put(
  "/reject-campus/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const idCampus = parseInt(id);

    if (isNaN(idCampus)) {
      return res.status(400).json({
        message: "ID Kampus tidak valid. Harus berupa angka.",
      });
    }

    if (!reason) {
      return res.status(400).json({
        message: "Alasan penolakan wajib diisi.",
      });
    }

    try {
      // Cek keberadaan kampus
      const existingCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
      });

      if (!existingCampus) {
        return res.status(404).json({
          message: "Data kampus tidak ditemukan.",
        });
      }

      // Update status menjadi rejected
      const updatedCampus = await prisma.campus.update({
        where: { id: idCampus },
        data: { verification_status: "rejected" },
      });

      // Konfigurasi Nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail", // Sesuaikan dengan provider email Anda (misal: gmail)
        auth: {
          user: process.env.EMAIL_USER, // Pastikan env ini diset
          pass: process.env.EMAIL_PASS, // Pastikan env ini diset (App Password jika Gmail)
        },
      });

      // Path ke logo lokal
      const logoPath = path.join(process.cwd(), "assets", "logo-text.png");

      // Kirim Email
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: existingCampus.email, // Mengirim ke email akun kampus
        subject: "Pemberitahuan Verifikasi Kampus - Ditolak",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <!-- Ganti src dengan URL logo publik aplikasi Anda -->
              <img src="cid:logoTempa" alt="TEMPA Logo" style="max-width: 150px; height: auto;" />
            </div>
            <h2 style="color: #333; text-align: center;">Status Verifikasi Kampus</h2>
            <p style="font-size: 16px; color: #555;">Halo <strong>${existingCampus.campus_name}</strong>,</p>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">
              Terima kasih telah mendaftar di platform kami. Setelah melakukan peninjauan data, kami mohon maaf untuk menginformasikan bahwa pengajuan verifikasi akun kampus Anda <strong>DITOLAK</strong>.
            </p>
            <div style="background-color: #fff5f5; border-left: 5px solid #ff4d4f; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #cf1322;">Alasan Penolakan:</p>
              <p style="margin: 5px 0 0; color: #555;">${reason}</p>
            </div>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">
              Silakan perbaiki data Anda sesuai dengan alasan di atas dan ajukan kembali verifikasi melalui dashboard.
            </p>
            <br>
            <p style="font-size: 16px; color: #555;">Salam hangat,<br><strong>Tim Admin TEMPA</strong></p>
          </div>
        `,
        attachments: [
          {
            filename: "logo-text.png",
            path: logoPath,
            cid: "logoTempa", // Harus sama dengan cid di tag img src
          },
        ],
      });

      return res.status(200).json({
        message: "Kampus berhasil ditolak dan email notifikasi terkirim.",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal menolak kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menolak kampus.",
        error: error.message,
      });
    }
  }
);

// get program campus for chart
router.get(
  "/get-program-campus-chart",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const getProgramCampus = await prisma.program.findMany({
        select: {
          id: true,
          program_name: true,
          campus_program_id_campusTocampus: {
            select: {
              campus_name: true,
            },
          },
          _count: {
            select: {
              mentee_progress: true,
            },
          },
        },
      });

      // get count total mentee
      const programsWithMenteeCount = getProgramCampus.map((program) => ({
        id: program.id,
        program_name: program.program_name,
        campus_name: program.campus_program_id_campusTocampus?.campus_name,
        // Total mentee diambil dari hasil perhitungan _count
        total_mentee: program._count.mentee_progress,
      }));

      console.log(programsWithMenteeCount);

      return res.status(200).json({
        message: "Data program beserta total mentee berhasil diambil",
        data: programsWithMenteeCount,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan saat mengambil data program",
        error: error.message,
      });
    }
  }
);

// get all program
router.get(
  "/all-program",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const getAllProgram = await prisma.program.findMany({
        where: {
          visibility: "public",
          campus_program_id_campusTocampus: {
            verification_status: "accepted",
          },
        },
        include: {
          campus_program_id_campusTocampus: {
            select: {
              campus_name: true,
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      const formatGetAllProgram = getAllProgram.map((item) => {
        const rawPath = item.path_gambar;
        let finalPath = rawPath;

        if (finalPath) {
          if (finalPath.startsWith("/")) {
            finalPath = finalPath.substring(1);
          }
          if (finalPath.startsWith("uploads/")) {
            finalPath = finalPath.substring("uploads/".length);
          }
        }

        // Menentukan URL gambar akhir
        const imageUrl = finalPath ? `${BASE_URL}/public/${finalPath}` : null;

        // 1. Ambil semua properti item
        const newItem = { ...item };

        // 2. Hapus properti path_gambar yang lama (opsional, tapi disarankan)
        delete newItem.path_gambar;

        // 3. Tambahkan properti image_url yang baru
        newItem.image_url = imageUrl;

        // 4. Tambahkan/ubah struktur properti relasi sesuai kebutuhan (jika diperlukan)
        // Contoh: Membuat major_name lebih mudah diakses (opsional)
        newItem.major_name =
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null;
        newItem.campus_name =
          item.campus_program_id_campusTocampus?.campus_name || null;

        // Hapus objek relasi yang panjang jika sudah tidak diperlukan
        delete newItem.campus_program_id_majorTocampus;
        delete newItem.campus_program_id_campusTocampus;

        return newItem;
      });
      console.log(formatGetAllProgram);

      // Mengirimkan data sebagai respons
      res.status(200).json({
        message: "Data Berhasil Dipanggil",
        data: formatGetAllProgram,
      });
    } catch (error) {
      console.error("Error fetching programs:", error);
      // Mengirimkan respons error
      res
        .status(500)
        .json({ msg: "Gagal mengambil data program", error: error.message });
    }
  }
);

// get detail program
router.get(
  "/detail-program/:id",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const idProgram = req.params.id;

      const detailProgram = await prisma.program.findUnique({
        where: {
          id: parseInt(idProgram),
        },
        include: {
          campus_program_id_campusTocampus: {
            select: {
              id: true,
              campus_name: true,
              address: true,
              email: true,
              path_logo: true,
              path_banner: true,
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: {
                select: {
                  major_name: true,
                },
              },
            },
          },
          sesi_program: {
            select: {
              type_sesi: true,
              description: true,
            },
          },
        },
      });

      if (!detailProgram) {
        // Tangani kasus 404 jika program tidak ditemukan
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }

      const item = detailProgram;

      // 1. FORMAT PATH GAMBAR PROGRAM UTAMA
      // Gunakan fungsi helper untuk memformat path_gambar program
      const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

      // 2. FORMAT PATH GAMBAR KAMPUS
      const campusData = item.campus_program_id_campusTocampus;

      // Format path_logo
      const logoUrl = formatPathToUrl(campusData.path_logo, BASE_URL);

      // Format path_banner
      const bannerUrl = formatPathToUrl(campusData.path_banner, BASE_URL);

      // 3. BUAT OBJEK HASIL AKHIR (formatGetDetailProgram)
      const formatGetDetailProgram = { ...item };

      // a. Hapus path_gambar lama dan tambahkan image_url baru ke level atas
      delete formatGetDetailProgram.path_gambar;
      formatGetDetailProgram.image_url = imageUrl;

      // b. Hapus path_logo dan path_banner lama dan tambahkan URL baru ke properti kampus
      delete formatGetDetailProgram.campus_program_id_campusTocampus.path_logo;
      delete formatGetDetailProgram.campus_program_id_campusTocampus
        .path_banner;

      // Tambahkan URL yang sudah diformat
      formatGetDetailProgram.campus_program_id_campusTocampus.logo_url =
        logoUrl;
      formatGetDetailProgram.campus_program_id_campusTocampus.banner_url =
        bannerUrl;

      console.log(formatGetDetailProgram);

      return res.status(200).json({
        message: "Detail program ditemukan",
        data: formatGetDetailProgram,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(404)
        .json({ message: "Not Found due to internal error." });
    }
  }
);

// get majors
router.get(
  "/all-majors",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    try {
      const allMajors = await prisma.standard_major.findMany({});

      if (!allMajors) {
        return res.status(404).json({ message: "Data Jurusan tidak ada." });
      }

      console.log(allMajors);

      return res.status(200).json({
        message: "Data Jurusan ditemukan",
        data: allMajors,
      });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: "Not Found due to internal error." });
    }
  }
);

// test midleware
router.post(
  "/testing-midleware",
  authenticateUser,
  authorizeRoles(["admin"]),
  async (req, res) => {
    const { test } = req.body;
    try {
      return res.status(200).json({
        message: "Middleware berhasil",
      });
    } catch (error) {
      return res.json({
        message: error,
      });
    }
  }
);

export default router;
