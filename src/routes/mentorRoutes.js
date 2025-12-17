import express from "express";
import prisma from "../../prisma/client.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authenticateUser from "../middlewares/auth.js";
import authorizeRoles from "../middlewares/roles.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

// =======================================================================
// MULTER CONFIG FOR PROGRAM IMAGE
// =======================================================================
const programImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/program_images";
    // Buat direktori jika belum ada
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "program-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadProgramImage = multer({
  storage: programImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!"));
    }
  },
});

// =======================================================================
// MULTER CONFIG FOR MATERI FILES
// =======================================================================
const materiFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/program_materi";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const dir = "uploads/program_materi";
    let fileName = file.originalname.replace(/\s+/g, "-");
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let counter = 1;

    while (fs.existsSync(path.join(dir, fileName))) {
      fileName = `${baseName}_${counter}${ext}`;
      counter++;
    }
    cb(null, fileName);
  },
});

const uploadMateriFiles = multer({
  storage: materiFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
});

// login admin
router.post("/login-mentor", async (req, res) => {
  const { nik, password } = req.body;

  //   check if username and password null
  if (!nik || !password) {
    return res.status(400).json({
      message: "Username or Password not found!",
    });
  }

  try {
    // search nik mentor
    const mentor = await prisma.mentor.findUnique({
      where: {
        nik: nik,
      },
    });

    // if username not found
    if (!mentor) {
      return res.status(401).json({
        message: "Username not found!",
      });
    }

    // validation password
    const isPasswordValid = await bcrypt.compare(password, mentor.password);

    // if password worng
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Password Wrong!",
      });
    }

    // sign JWT token
    const token = jwt.sign(
      {
        id: mentor.id,
        username: mentor.name,
        nik: mentor.nik,
        mentorType: mentor.mentor_type,
        role: "mentor",
      },
      JWT_SECRET,
      { expiresIn: "1d" } // expired in 1 day
    );

    return res.status(200).json({
      message: "Login mentor success",
      token: token,
      adminId: mentor.name,
    });
  } catch (error) {
    console.error("Kesalahan saat login login:", error);
    return res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
});

// get program campus for chart
router.get(
  "/get-program-campus-chart",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    try {
      const getProgramCampus = await prisma.program_mentor.findMany({
        where: {
          id_mentor: idMentor,
        },
        select: {
          program: {
            select: {
              id: true,
              program_name: true,
              _count: {
                select: {
                  mentee_progress: true,
                },
              },
            },
          },
        },
      });

      // get count total mentee
      const programsWithMenteeCount = getProgramCampus.map((item) => ({
        id: item.program.id,
        program_name: item.program.program_name,
        // Total mentee diambil dari hasil perhitungan _count
        total_mentee: item.program._count.mentee_progress,
      }));

      console.log(programsWithMenteeCount);

      return res.status(200).json({
        message: "Data program beserta total mentee berhasil diambil",
        total_program: programsWithMenteeCount.length,
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

// get program by mentor id
router.get(
  "/get-mentor-programs",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;

    try {
      const programMentor = await prisma.program_mentor.findMany({
        where: {
          id_mentor: idMentor,
        },
        include: {
          program: {
            include: {
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
        },
      });

      const formattedPrograms = programMentor.map((pm) => {
        const item = pm.program;
        const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

        const majorName =
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null;

        const newItem = {
          id: item.id,
          program_name: item.program_name,
          description: item.description,
          start_date: item.start_regis_date,
          end_date: item.end_regis_date,
          capacity: item.capacity,
          program_status: item.program_status,
          onsiteLocationName: item.onsiteLocationName,
          major_name: majorName,
          image_url: imageUrl,
          sesi_program: item.type_sesi,
          visibility: item.visibility,
        };

        return newItem;
      });

      console.log(formattedPrograms);

      return res.status(200).json({
        message: "Berhasil mengambil data program mentor",
        data: formattedPrograms,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan server",
        error: error.message,
      });
    }
  }
);

// get detail program by id for mentor
router.get(
  "/get-detail-program/:id",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const idProgram = req.params.id;
    const parsedIdProgram = parseInt(idProgram);

    // Validasi ID Program
    if (isNaN(parsedIdProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    try {
      const detailProgram = await prisma.program.findFirst({
        where: {
          id: parsedIdProgram,
          program_mentor: {
            some: {
              id_mentor: idMentor,
            },
          },
        },
        include: {
          program_mentor: {
            where: {
              id_program: parsedIdProgram,
            },
            include: {
              mentor: {
                select: {
                  id: true,
                  name: true,
                  nik: true,
                  mentor_type: true,
                },
              },
            },
          },
          campus_program_id_majorTocampus: {
            include: {
              standard_major: {
                select: {
                  id: true,
                  major_name: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN MATERI PROGRAM
          materi: {
            select: {
              id: true,
              title: true,
              description: true,
              visibility: true,
              // Anda bisa tambahkan materi_resource jika perlu detail file
              materi_resource: {
                select: {
                  type: true,
                  path_file: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN PROGRESS MENTEE (PESERTA)
          mentee_progress: {
            select: {
              completion_status: true,
              final_score: true,
              mentee: {
                // Relasi ke detail mentee
                select: {
                  username: true,
                  email: true,
                  gender: true,
                },
              },
            },
          },
          // ✅ TAMBAHKAN COUNT UNTUK TOTAL PESERTA TERDAFTAR
          _count: {
            select: {
              mentee_progress: true,
            },
          },
        },
      });

      if (!detailProgram) {
        return res.status(404).json({
          message:
            "Program tidak ditemukan atau Anda tidak terdaftar sebagai mentor di program ini.",
        });
      }

      const item = detailProgram;

      // FORMAT PATH GAMBAR PROGRAM UTAMA
      const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);
      const formattedMateriList = item.materi.map((materi) => ({
        ...materi,
        // Lakukan mapping pada materi_resource
        materi_resource: materi.materi_resource.map((resource) => {
          const newItem = {
            ...resource,
            resource_url:
              resource.type === "kuis" || resource.type === "video"
                ? resource.path_file
                : formatPathToUrl(resource.path_file, BASE_URL),
          };
          delete newItem.path_file;
          return newItem;
        }),
      }));

      // BUAT OBJEK HASIL AKHIR
      const formattedDetail = {
        ...item,
        image_url: imageUrl,
        major_name:
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null,
        registered_mentees: item._count?.mentee_progress || 0,
        // ✅ MAP dan bersihkan list mentee agar lebih mudah diakses di frontend
        mentee_list: item.mentee_progress.map((mp) => ({
          username: mp.mentee?.username,
          email: mp.mentee?.email,
          gender: mp.mentee?.gender,
          completion_status: mp.completion_status,
          final_score: mp.final_score,
        })),
        // ✅ Gunakan data materi yang sudah diformat
        materi_list: formattedMateriList,
        mentor_list: item.program_mentor.map((pm) => ({
          id: pm.id,
          mentor_id: pm.mentor?.id,
          name: pm.mentor?.name,
          nik: pm.mentor?.nik,
          mentor_type: pm.mentor?.mentor_type,
        })),
      };

      // Bersihkan properti yang tidak diperlukan lagi (opsional)
      delete formattedDetail.path_gambar;
      delete formattedDetail.program_mentor;
      delete formattedDetail.id_campus;
      delete formattedDetail.id_mentor;
      delete formattedDetail.id_session_type;
      delete formattedDetail.campus_program_id_majorTocampus;
      delete formattedDetail._count;
      // Hapus mentee_progress mentah yang sudah dipetakan
      delete formattedDetail.mentee_progress;
      delete formattedDetail.materi; // Hapus materi mentah

      return res.status(200).json({
        message: "Detail program berhasil ditemukan.",
        data: formattedDetail,
      });
    } catch (error) {
      console.error("Error fetching detail program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil detail program.",
        error: error.message,
      });
    }
  }
);

// create program for mentor
router.post(
  "/create-program",
  authenticateUser,
  authorizeRoles(["mentor"]),
  uploadProgramImage.single("bannerImage"),
  async (req, res) => {
    const idMentor = req.user.id;

    // Validasi file upload
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Gambar banner program wajib diunggah." });
    }

    const {
      name,
      majorName,
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits, // JSON string
      terms, // JSON string
      location_name,
      mapLat,
      mapLng,
    } = req.body;

    // Validasi field wajib
    const requiredFields = {
      name,
      majorName,
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits,
      terms,
    };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) {
        // Hapus file jika validasi gagal
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ message: `Field '${field}' wajib diisi.` });
      }
    }

    try {
      // 1. Ambil data mentor untuk mendapatkan id_campus
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true },
      });

      if (!mentorData) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      const idCampus = mentorData.id_campus;

      // 2. Konversi majorName (yang sebenarnya adalah majorId) ke integer
      const majorId = parseInt(majorName, 10);
      if (isNaN(majorId)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ message: "Format ID Jurusan tidak valid." });
      }

      // 3. Cari Major berdasarkan ID-nya dan pastikan milik kampus mentor
      const major = await prisma.major.findFirst({
        where: {
          id: majorId,
          id_campus: idCampus,
        },
        select: {
          id: true,
        },
      });
      if (!major) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({
          message: `Jurusan dengan ID '${majorId}' tidak ditemukan atau bukan milik kampus Anda.`,
        });
      }

      // 4. Konversi tipe data & Helper parsing
      const parseJsonOrWrapInArray = (value) => {
        if (typeof value === "string") {
          try {
            return JSON.parse(value);
          } catch (e) {
            return value
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item);
          }
        }
        return [];
      };

      const parsedCapacity = parseInt(capacity, 10);
      if (isNaN(parsedCapacity)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(400)
          .json({ message: "Kapasitas harus berupa angka." });
      }

      let parsedLat = null;
      let parsedLng = null;

      // 5. Siapkan data untuk disimpan
      const programData = {
        program_name: name,
        description: description,
        start_program_date: new Date(startDateProgram),
        end_program_date: new Date(endDateProgram),
        start_regis_date: new Date(startRegisDate),
        end_regis_date: new Date(endRegisDate),
        capacity: parsedCapacity,
        // program_status: "open",
        id_campus: idCampus,
        id_major: major.id,
        path_gambar: req.file.path.replace(/\\/g, "/"),
        benefit: parseJsonOrWrapInArray(benefits),
        terms_and_conditions: parseJsonOrWrapInArray(terms),
        type_sesi: programType,
        sesi_start: new Date(`1970-01-01T${startTime}:00`),
        sesi_end: new Date(`1970-01-01T${endTime}:00`),
        visibility: visibility,
        create_at: new Date(),
        update_at: new Date(),
      };

      // Tambahkan data lokasi jika program 'onsite'
      if (programType === "onsite") {
        parsedLat = parseFloat(mapLat);
        parsedLng = parseFloat(mapLng);

        if (!location_name || isNaN(parsedLat) || isNaN(parsedLng)) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            message:
              "Untuk program onsite, nama lokasi, latitude, dan longitude wajib diisi dengan benar.",
          });
        }

        programData.onsiteLocationName = location_name;
        programData.lat = parsedLat;
        programData.lng = parsedLng;
      }

      // 6. Buat program baru di database DAN assign mentor ke program tersebut
      const newProgram = await prisma.$transaction(async (tx) => {
        // Create Program
        const createdProgram = await tx.program.create({
          data: programData,
        });

        // Assign Mentor to Program
        await tx.program_mentor.create({
          data: {
            id_mentor: idMentor,
            id_program: createdProgram.id,
          },
        });

        return createdProgram;
      });

      return res.status(201).json({
        message: "Program berhasil dibuat.",
        data: newProgram,
      });
    } catch (error) {
      // Hapus file yang sudah diupload jika terjadi error
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error("Gagal menghapus file setelah error:", err);
        });
      }

      console.error("Gagal membuat program:", error);
      if (error instanceof SyntaxError) {
        return res.status(400).json({
          message: "Format JSON pada 'benefits' atau 'terms' tidak valid.",
        });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat membuat program.",
        error: error.message,
      });
    }
  }
);

// edit program by id for mentor
router.put(
  "/edit-program/:id",
  authenticateUser,
  authorizeRoles(["mentor"]),
  uploadProgramImage.single("bannerImage"), // Middleware untuk handle upload gambar
  async (req, res) => {
    const idMentor = req.user.id;
    const { id } = req.params;
    const idProgram = parseInt(id, 10);

    if (isNaN(idProgram)) {
      return res
        .status(400)
        .json({ message: "ID Program tidak valid. Harus berupa angka." });
    }

    const {
      name,
      majorName, // Ini adalah ID jurusan
      programType,
      visibility,
      startRegisDate,
      endRegisDate,
      startDateProgram,
      endDateProgram,
      startTime,
      endTime,
      capacity,
      description,
      benefits,
      terms,
      onsiteLocationName,
      mapLat,
      mapLng,
    } = req.body;

    try {
      // 1. Cari program yang akan di-edit untuk verifikasi akses mentor
      const existingProgram = await prisma.program.findFirst({
        where: {
          id: idProgram,
          program_mentor: {
            some: {
              id_mentor: idMentor,
            },
          },
        },
      });

      if (!existingProgram) {
        return res.status(404).json({
          message:
            "Program tidak ditemukan atau Anda tidak memiliki akses untuk mengeditnya.",
        });
      }

      // 2. Validasi Major ID baru (jika diubah)
      const majorId = parseInt(majorName, 10);
      if (isNaN(majorId)) {
        return res
          .status(400)
          .json({ message: "Format ID Jurusan tidak valid." });
      }

      // Pastikan jurusan milik kampus yang sama dengan program
      const major = await prisma.major.findFirst({
        where: { id: majorId, id_campus: existingProgram.id_campus },
      });

      if (!major) {
        return res.status(404).json({
          message: `Jurusan dengan ID '${majorId}' tidak ditemukan atau bukan milik kampus program ini.`,
        });
      }

      // Helper untuk menangani field yang bisa berupa string atau array dari FormData
      const processMultiPartArray = (field) => {
        if (!field) return [];
        if (Array.isArray(field)) return field.map((item) => item.trim());
        return [field.trim()];
      };

      // 3. Siapkan data yang akan di-update
      const dataToUpdate = {
        program_name: name,
        id_major: majorId,
        type_sesi: programType,
        visibility: visibility,
        start_regis_date: new Date(startRegisDate),
        end_regis_date: new Date(endRegisDate),
        start_program_date: new Date(startDateProgram),
        end_program_date: new Date(endDateProgram),
        sesi_start: new Date(`1970-01-01T${startTime}:00`),
        sesi_end: new Date(`1970-01-01T${endTime}:00`),
        capacity: parseInt(capacity, 10),
        description: description,
        benefit: processMultiPartArray(benefits),
        terms_and_conditions: processMultiPartArray(terms),
        update_at: new Date(),
      };

      // 4. Handle upload gambar baru (jika ada)
      if (req.file) {
        // Hapus gambar lama jika ada
        if (existingProgram.path_gambar) {
          const oldImagePath = path.join(
            process.cwd(),
            existingProgram.path_gambar
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (err) => {
              if (err)
                console.error(
                  "Gagal menghapus gambar lama:",
                  oldImagePath,
                  err
                );
            });
          }
        }
        // Tambahkan path gambar baru ke data yang akan di-update
        dataToUpdate.path_gambar = req.file.path.replace(/\\/g, "/");
      }

      // 5. Handle data kondisional untuk program 'onsite'
      if (programType === "onsite") {
        const parsedLat = parseFloat(mapLat);
        const parsedLng = parseFloat(mapLng);

        if (!onsiteLocationName || isNaN(parsedLat) || isNaN(parsedLng)) {
          return res.status(400).json({
            message:
              "Untuk program onsite, nama lokasi, latitude, dan longitude wajib diisi.",
          });
        }
        dataToUpdate.onsiteLocationName = onsiteLocationName;
        dataToUpdate.lat = parsedLat;
        dataToUpdate.lng = parsedLng;
      } else {
        // Jika tipe program diubah dari onsite ke online, hapus data lokasi
        dataToUpdate.onsiteLocationName = null;
        dataToUpdate.lat = null;
        dataToUpdate.lng = null;
      }

      // 6. Lakukan update di database
      const updatedProgram = await prisma.program.update({
        where: { id: idProgram },
        data: dataToUpdate,
      });

      return res.status(200).json({
        message: "Program berhasil diperbarui.",
        data: updatedProgram,
      });
    } catch (error) {
      // Jika terjadi error setelah file diunggah, hapus file tersebut
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err)
            console.error(
              "Gagal menghapus file yang baru diunggah setelah error:",
              err
            );
        });
      }

      console.error("Gagal mengedit program:", error);
      if (error.code === "P2025") {
        return res.status(404).json({ message: "Program tidak ditemukan." });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengedit program.",
        error: error.message,
      });
    }
  }
);

// get major campus
router.get(
  "/all-majors",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;

    try {
      // Cari data mentor untuk mendapatkan id_campus
      const mentor = await prisma.mentor.findUnique({
        where: {
          id: idMentor,
        },
        select: {
          id_campus: true,
        },
      });

      if (!mentor) {
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      const allMajors = await prisma.major.findMany({
        where: {
          id_campus: mentor.id_campus,
        },
        include: {
          standard_major: true,
        },
      });

      if (!allMajors || allMajors.length === 0) {
        return res.status(404).json({ message: "Data Jurusan tidak ada." });
      }

      return res.status(200).json({
        message: "Data Jurusan ditemukan",
        data: allMajors,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengambil data jurusan.",
      });
    }
  }
);

// =======================================================================
// ADD MATERI TO PROGRAM
// =======================================================================
router.post(
  "/add-materi/:idProgram",
  authenticateUser,
  authorizeRoles(["mentor"]),
  uploadMateriFiles.single("file"),
  async (req, res) => {
    const idMentor = req.user.id;
    const { idProgram } = req.params;
    const { title, description, visibility, type, url } = req.body;

    const idProgramInt = parseInt(idProgram, 10);

    // Validasi ID Program
    if (isNaN(idProgramInt)) {
      return res.status(400).json({ message: "ID Program tidak valid." });
    }

    // Validasi Input Wajib
    if (!title || !description) {
      // Hapus file yang sudah terlanjur diupload jika validasi gagal
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        message:
          "Judul (title) dan deskripsi (description) materi wajib diisi.",
      });
    }

    try {
      // 1. Verifikasi Kepemilikan Program (Mentor assigned to program)
      const program = await prisma.program.findFirst({
        where: {
          id: idProgramInt,
          program_mentor: {
            some: {
              id_mentor: idMentor,
            },
          },
        },
      });

      if (!program) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(404).json({
          message: "Program tidak ditemukan atau Anda tidak memiliki akses.",
        });
      }

      // 2. Siapkan Data Resource (File)
      let resourcePath = "";

      if (type === "file") {
        if (!req.file) {
          return res.status(400).json({
            message: "File wajib diunggah untuk tipe materi 'file'.",
          });
        }
        resourcePath = `uploads/program_materi/${req.file.filename}`;
      } else if (type === "kuis" || type === "video") {
        if (!url) {
          if (req.file && fs.existsSync(req.file.path))
            fs.unlinkSync(req.file.path);
          return res.status(400).json({
            message: `URL wajib diisi untuk tipe materi '${type}'.`,
          });
        }
        resourcePath = url;
        // Jika user tidak sengaja upload file tapi pilih type kuis/video, hapus filenya
        if (req.file && fs.existsSync(req.file.path))
          fs.unlinkSync(req.file.path);
      } else {
        if (req.file && fs.existsSync(req.file.path))
          fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message:
            "Tipe materi tidak valid. Gunakan 'file', 'kuis', atau 'video'.",
        });
      }

      // 3. Simpan Materi dan Resource ke Database
      const newMateri = await prisma.materi.create({
        data: {
          title: title,
          description: description,
          visibility: visibility || "public", // Default public
          id_program: idProgramInt,
          create_at: new Date(),
          update_at: new Date(),
          materi_resource: {
            create: [
              {
                type: type,
                path_file: resourcePath,
              },
            ],
          },
        },
        include: {
          materi_resource: true,
        },
      });

      return res.status(201).json({
        message: "Materi berhasil ditambahkan ke program.",
        data: newMateri,
      });
    } catch (error) {
      // Hapus file jika terjadi error database
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Gagal menambahkan materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menambahkan materi.",
        error: error.message,
      });
    }
  }
);

// delete program by id for mentor
router.delete(
  "/delete-program/:id",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const { id } = req.params;
    const idProgram = parseInt(id);

    // Validasi ID program
    if (isNaN(idProgram)) {
      return res.status(400).json({
        message: "ID Program tidak valid. Harus berupa angka.",
      });
    }

    try {
      // 1. Cari program untuk verifikasi kepemilikan dan mendapatkan path gambar
      const programToDelete = await prisma.program.findFirst({
        where: {
          id: idProgram,
          program_mentor: {
            some: {
              id_mentor: idMentor,
            },
          },
        },
        select: {
          path_gambar: true,
        },
      });

      // Jika program tidak ditemukan atau bukan milik kampus ini
      if (!programToDelete) {
        return res.status(404).json({
          message:
            "Program tidak ditemukan atau Anda tidak berhak menghapusnya.",
        });
      }

      // 2. Hapus file gambar jika ada
      if (programToDelete.path_gambar) {
        // process.cwd() akan mengarah ke root proyek: /home/apipi/Pbl Sem-5/TEMPA-BE
        const imagePath = path.join(process.cwd(), programToDelete.path_gambar);

        // Cek apakah file ada sebelum mencoba menghapus
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, (err) => {
            if (err) {
              // Log error jika gagal menghapus file, tapi lanjutkan proses
              console.error(`Gagal menghapus file gambar: ${imagePath}`, err);
            } else {
              console.log(`File gambar berhasil dihapus: ${imagePath}`);
            }
          });
        }
      }

      // 3. Hapus relasi program_mentor terlebih dahulu (karena constraint NoAction)
      await prisma.program_mentor.deleteMany({
        where: {
          id_program: idProgram,
        },
      });

      // 4. Hapus program dari database
      await prisma.program.delete({
        where: {
          id: idProgram,
        },
      });

      return res.status(200).json({
        message: `Program dengan ID ${idProgram} berhasil dihapus.`,
      });
    } catch (error) {
      console.error("Gagal menghapus program:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus program.",
        error: error.message,
      });
    }
  }
);

// test midleware
router.post(
  "/testing-midleware",
  authenticateUser,
  authorizeRoles(["mentor"]),
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
