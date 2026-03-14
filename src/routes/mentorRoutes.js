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
      path.extname(file.originalname).toLowerCase(),
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

// =======================================================================
// MULTER CONFIG FOR CAMPUS IMAGES (LOGO & BANNER)
// =======================================================================
const campusImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // file.fieldname akan menjadi 'logo' atau 'banner'
    const dir = `uploads/campus_images/${file.fieldname}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `campus-${file.fieldname}-` +
        uniqueSuffix +
        path.extname(file.originalname),
    );
  },
});

const uploadCampusImages = multer({
  storage: campusImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!"));
  },
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
      { expiresIn: "1d" }, // expired in 1 day
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
  },
);

// get program by mentor id
router.get(
  "/get-mentor-programs",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const typeMentor = req.user.mentorType;
    // console.log(typeMentor);
    try {
      let rawPrograms = [];

      if (typeMentor === "super_mentor") {
        // 1. Ambil data mentor untuk mendapatkan id_campus
        const mentorData = await prisma.mentor.findUnique({
          where: { id: idMentor },
          select: { id_campus: true },
        });

        if (!mentorData) {
          return res
            .status(404)
            .json({ message: "Data mentor tidak ditemukan." });
        }

        // 2. Ambil semua program berdasarkan id_campus
        rawPrograms = await prisma.program.findMany({
          where: {
            id_campus: mentorData.id_campus,
          },
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
          orderBy: {
            create_at: "desc",
          },
        });
      } else {
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

        // Map agar strukturnya sama dengan rawPrograms (array of program objects)
        rawPrograms = programMentor.map((pm) => pm.program);
      }

      const formattedPrograms = rawPrograms.map((item) => {
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

      // console.log(formattedPrograms);

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
  },
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
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true },
      });

      const getCampusSubscription = await prisma.campus_subscription.findFirst({
        where: {
          id_campus: mentorData.id_campus,
          id_package: {
            in: [1, 2],
          },
          expired_date: {
            gte: new Date(),
          },
        },
      });

      if (!mentorData) {
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      const detailProgram = await prisma.program.findFirst({
        where: {
          id: parsedIdProgram,
          id_campus: mentorData.id_campus,
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

          materi: {
            select: {
              id: true,
              title: true,
              description: true,
              visibility: true,
              materi_resource: {
                select: {
                  type: true,
                  path_file: true,
                },
              },
            },
          },

          // get mentee where register program
          mentee_progress: {
            select: {
              completion_status: true,
              final_score: true,
              create_at: true,
              mentee: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  gender: true,
                },
              },
            },
          },
          mentee_attendance: {
            where: {
              id_program: parsedIdProgram,
            },
            select: {
              id: true,
              status: true,
              attendance_date: true,
              id_mentee: true,
              id_program: true,
            },
          },
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

      let formattedCityDistribution = [];
      let formattedEducationStatus = [];

      if (getCampusSubscription) {
        // Ambil statistik distribusi kota mentee yang terdaftar di program ini
        const cityDistribution = await prisma.mentee.groupBy({
          by: ["city"],
          where: {
            mentee_progress: {
              some: {
                id_program: parsedIdProgram,
              },
            },
            city: {
              not: null,
            },
          },
          _count: {
            city: true,
          },
          orderBy: {
            _count: {
              city: "desc",
            },
          },
        });

        formattedCityDistribution = cityDistribution.map((item) => ({
          city: item.city,
          total: item._count.city,
        }));

        // Ambil statistik status pendidikan mentee yang terdaftar di program ini
        const educationStatusDistribution = await prisma.mentee.groupBy({
          by: ["education_status"],
          where: {
            mentee_progress: {
              some: {
                id_program: parsedIdProgram,
              },
            },
          },
          _count: {
            education_status: true,
          },
        });

        formattedEducationStatus = educationStatusDistribution.map((item) => ({
          status: item.education_status,
          total: item._count.education_status,
        }));
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
        seen: !getCampusSubscription ? false : detailProgram.seen,
        major_name:
          item.campus_program_id_majorTocampus?.standard_major?.major_name ||
          null,
        registered_mentees: item._count?.mentee_progress || 0,
        // format data for mentee list
        free_trial: getCampusSubscription ? true : false,
        send_mail: getCampusSubscription?.id_package === 2 ? true : false,
        mentee_list: item.mentee_progress.map((mp) => {
          // 1. Ambil ID mentee saat ini
          const currentMenteeId = mp.mentee?.id;

          // 2. Filter data presensi dari array besar 'mentee_attendance'
          // yang hanya milik mentee ini
          const specificAttendance = item.mentee_attendance.filter(
            (attendance) => attendance.id_mentee === currentMenteeId,
          );

          return {
            id: currentMenteeId,
            username: mp.mentee?.username,
            email:
              getCampusSubscription?.id_package === 2 ? mp.mentee?.email : null,
            gender: mp.mentee?.gender,
            completion_status: mp.completion_status,
            final_score: mp.final_score,
            create_at: mp.create_at,
            city_distribution: formattedCityDistribution,
            education_status_distribution: formattedEducationStatus,

            // 3. Masukkan data presensi yang sudah difilter ke dalam objek mentee
            attendance_list: specificAttendance,
          };
        }),
        // format data for matery
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

      console.log(formattedDetail);

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
  },
);

// update expired presensi
router.put(
  "/update-expired-presensi-mentor/:idProgram",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    try {
      const programId = parseInt(req.params.idProgram);
      const { expiredPresensi } = req.body;

      // console.log(expiredPresensi);

      if (!Array.isArray(expiredPresensi)) {
        // throw new AppError("Format data presensi tidak valid", 400);
        return res.status(400).json({
          message: "Format data presensi tidak valid",
        });
      }

      if (!programId) {
        // throw new AppError("Program tidak ditemukan", 404);
        return res.status(404).json({
          message: "Program tidak ditemukan",
        });
      }

      const updateExpiredPresensi = await prisma.program.update({
        where: {
          id: programId,
        },
        data: {
          expired_presensi: expiredPresensi,
        },
      });

      return res.status(200).json({
        message: "Expired presensi berhasil diperbarui",
        data: updateExpiredPresensi,
      });
    } catch (error) {
      return res
        .status(500)
        .json(
          "Terjadi kesalahan server saat memperbarui expired presensi.",
          error,
        );
    }
  },
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
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      if (!mentorData.mentor_type == "super_mentor") {
        return res
          .status(403)
          .json({ message: "Anda tidak bisa menambahkan program!" });
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
  },
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
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData.mentor_type == "super_mentor") {
        return res
          .status(403)
          .json({ message: "Anda tidak bisa menambahkan program!" });
      }
      // 1. Cari program yang akan di-edit untuk verifikasi akses mentor
      const existingProgram = await prisma.program.findFirst({
        where: {
          id: idProgram,
          id_campus: mentorData.id_campus,
        },
      });
      console.log(existingProgram);

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
            existingProgram.path_gambar,
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (err) => {
              if (err)
                console.error(
                  "Gagal menghapus gambar lama:",
                  oldImagePath,
                  err,
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
              err,
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
  },
);

// get major for form major
router.get(
  "/all-majors-form",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    try {
      const allMajors = await prisma.standard_major.findMany({
        select: {
          id: true,
          major_name: true,
        },
      });

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
  },
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
  },
);

// add majors to campus for mentor
router.post(
  "/add-majors-campus",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const newMajorsFromRequest = req.body;

    // 1. Validasi input
    if (!Array.isArray(newMajorsFromRequest)) {
      return res.status(400).json({
        message:
          "Input tidak valid. Diperlukan sebuah array berisi objek jurusan (major).",
      });
    }

    try {
      // 2. Ambil data mentor untuk mendapatkan id_campus
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData) {
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      if (mentorData.mentor_type !== "super_mentor") {
        return res.status(403).json({
          message:
            "Anda tidak memiliki izin untuk mengedit data jurusan kampus!",
        });
      }

      const idCampus = mentorData.id_campus;

      // Ekstrak ID jurusan standar dari request dan pastikan unik
      const newStandardMajorIds = new Set(
        newMajorsFromRequest
          .map((major) => major.id)
          .filter((id) => typeof id === "number"),
      );

      // Ambil semua jurusan yang saat ini terdaftar untuk kampus ini
      const existingMajors = await prisma.major.findMany({
        where: { id_campus: idCampus },
        select: { id_standard_major: true },
      });
      const existingStandardMajorIds = new Set(
        existingMajors.map((major) => major.id_standard_major),
      );

      // Tentukan jurusan mana yang akan ditambahkan dan dihapus
      const idsToAdd = [...newStandardMajorIds].filter(
        (id) => !existingStandardMajorIds.has(id),
      );
      const idsToRemove = [...existingStandardMajorIds].filter(
        (id) => !newStandardMajorIds.has(id),
      );

      // Gunakan transaksi untuk memastikan semua operasi berhasil atau tidak sama sekali
      const transactionResult = await prisma.$transaction(async (tx) => {
        // Hapus jurusan yang tidak lagi ada di daftar
        if (idsToRemove.length > 0) {
          await tx.major.deleteMany({
            where: {
              id_campus: idCampus,
              id_standard_major: { in: idsToRemove },
            },
          });
        }

        // Tambahkan jurusan baru
        if (idsToAdd.length > 0) {
          await tx.major.createMany({
            data: idsToAdd.map((id) => ({
              id_campus: idCampus,
              id_standard_major: id,
            })),
          });
        }

        return { added: idsToAdd.length, removed: idsToRemove.length };
      });

      return res.status(200).json({
        message: `Sinkronisasi jurusan berhasil. Ditambahkan: ${transactionResult.added}, Dihapus: ${transactionResult.removed}.`,
        data: {
          id_campus: idCampus,
          synced_majors: [...newStandardMajorIds],
        },
      });
    } catch (error) {
      console.error("Gagal menambahkan jurusan ke kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menambahkan jurusan.",
        error: error.message,
      });
    }
  },
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
  },
);

// =======================================================================
// EDIT MATERI AND ADD RESOURCES
// =======================================================================
router.put(
  "/edit-materi/:idMateri",
  authenticateUser,
  authorizeRoles(["mentor"]),
  uploadMateriFiles.any(),
  async (req, res) => {
    const idMentor = req.user.id;
    const { idMateri } = req.params;
    const { title, description, visibility } = req.body;

    const idMateriInt = parseInt(idMateri, 10);

    // Helper untuk menghapus file jika terjadi error
    const cleanupFiles = (files) => {
      if (files && Array.isArray(files)) {
        files.forEach((file) => {
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
      }
    };

    const normalizeResourcePath = (inputPath) => {
      if (!inputPath) return "";
      inputPath = inputPath.replace(/^https?:\/\/[^/]+\/public\//, "");
      const parts = inputPath.split("program_materi/");
      if (parts.length < 2) return "";
      return `program_materi/${parts[1]}`;
    };

    if (isNaN(idMateriInt)) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: "ID Materi tidak valid." });
    }

    try {
      // 1. Cari Materi dan Verifikasi Kepemilikan
      const materi = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: {
          program: {
            include: {
              program_mentor: {
                where: {
                  id_mentor: idMentor,
                },
              },
            },
          },
          materi_resource: true,
        },
      });

      if (!materi) {
        cleanupFiles(req.files);
        return res.status(404).json({ message: "Materi tidak ditemukan." });
      }

      // Verifikasi apakah mentor terdaftar di program materi ini
      const isMentorAssigned =
        materi.program && materi.program.program_mentor.length > 0;

      if (!isMentorAssigned) {
        cleanupFiles(req.files);
        return res.status(403).json({
          message: "Anda tidak memiliki akses untuk mengedit materi ini.",
        });
      }

      // 2. Parsing new_resources dari req.body dan req.files
      const newResourcesMap = {};

      // Helper to safely set resource data
      const setResourceData = (index, key, value) => {
        if (!newResourcesMap[index]) newResourcesMap[index] = {};
        newResourcesMap[index][key] = value;
      };

      // Cek jika new_resources sudah berupa array/objek (parsed body)
      if (
        req.body.new_resources &&
        typeof req.body.new_resources === "object"
      ) {
        Object.keys(req.body.new_resources).forEach((index) => {
          const item = req.body.new_resources[index];
          if (item && typeof item === "object") {
            Object.keys(item).forEach((key) => {
              setResourceData(index, key, item[key]);
            });
          }
        });
      }

      // Parse field teks (type, url, dll)
      Object.keys(req.body).forEach((key) => {
        const match = key.match(/^new_resources\[(\d+)\]\[(\w+)\]$/);
        if (match) {
          setResourceData(match[1], match[2], req.body[key]);
        }
      });

      // Map file yang diupload ke index yang sesuai
      if (req.files) {
        req.files.forEach((file) => {
          // Fieldname format: new_resources[0][file]
          const match = file.fieldname.match(
            /^new_resources\[(\d+)\]\[file\]$/,
          );
          if (match) {
            setResourceData(match[1], "file", file);
          }
        });
      }

      const newResources = Object.values(newResourcesMap);
      // Filter resource yang memiliki type ATAU memiliki file (jika type lupa dikirim)
      const validNewResources = newResources.filter(
        (res) => res.type || res.file,
      );

      // 3. Kelola Resource Lama (Keep dan Delete)
      let keptResourceIds = [];

      if (req.body.kept_resource_ids) {
        if (Array.isArray(req.body.kept_resource_ids)) {
          keptResourceIds = req.body.kept_resource_ids.map((id) =>
            parseInt(id, 10),
          );
        } else if (typeof req.body.kept_resource_ids === "object") {
          keptResourceIds = Object.values(req.body.kept_resource_ids).map(
            (id) => parseInt(id, 10),
          );
        } else {
          keptResourceIds = [parseInt(req.body.kept_resource_ids, 10)];
        }
      }

      Object.keys(req.body).forEach((key) => {
        const match = key.match(/^kept_resource_ids\[(\d+)\]$/);
        if (match) {
          keptResourceIds.push(parseInt(req.body[key], 10));
        }
      });

      keptResourceIds = [...new Set(keptResourceIds.filter(Number.isInteger))];

      // 4. Validasi dan Persiapan Data Resource Baru
      const resourcesToCreate = [];

      for (const [idx, resData] of validNewResources.entries()) {
        let type = resData.type ? resData.type.trim().toLowerCase() : "";

        if (!type && resData.file) {
          type = "file";
        }

        let resourcePath = "";

        if (type === "file") {
          if (!resData.file) {
            let isExistingFile = false;
            if (resData.url) {
              const normalizedUrl = normalizeResourcePath(resData.url);
              const existingRes = materi.materi_resource.find(
                (r) =>
                  r.type === "file" &&
                  normalizeResourcePath(r.path_file) === normalizedUrl,
              );

              if (existingRes) {
                keptResourceIds.push(existingRes.id);
                continue;
              }
            }

            if (isExistingFile) continue;

            cleanupFiles(req.files);
            return res.status(400).json({
              message: "File wajib diunggah untuk resource bertipe 'file'.",
            });
          }
          resourcePath = `uploads/program_materi/${resData.file.filename}`;
        } else if (type === "kuis" || type === "video") {
          const urlValue = resData.url || resData.path_file;

          if (!urlValue) {
            cleanupFiles(req.files);
            return res.status(400).json({
              message: `URL wajib diisi untuk tipe '${type}'.`,
            });
          }
          resourcePath = urlValue;

          if (resData.file && fs.existsSync(resData.file.path)) {
            fs.unlinkSync(resData.file.path);
          }
        } else {
          cleanupFiles(req.files);
          return res.status(400).json({
            message:
              "Tipe resource tidak valid. Gunakan 'file', 'kuis', atau 'video'.",
          });
        }

        resourcesToCreate.push({
          id_materi: idMateriInt,
          type: type,
          path_file: resourcePath,
        });
      }

      keptResourceIds = [...new Set(keptResourceIds)];

      const existingResourceIds = materi.materi_resource.map((r) => r.id);
      const resourcesToDeleteIds = existingResourceIds.filter(
        (id) => !keptResourceIds.includes(id),
      );

      const keptCount = keptResourceIds.length;
      const newCount = resourcesToCreate.length;

      if (keptCount + newCount > 3) {
        cleanupFiles(req.files);
        return res.status(400).json({
          message: `Gagal: Jumlah resource (lama + baru) melebihi batas (Max 3). Resource yang dipertahankan: ${keptCount}, Resource baru: ${newCount}.`,
        });
      }

      const newResourcePaths = resourcesToCreate.map((r) => r.path_file);
      const resourcesToDelete = materi.materi_resource.filter((r) =>
        resourcesToDeleteIds.includes(r.id),
      );

      const idsToRescue = resourcesToDelete
        .filter(
          (r) => r.type === "file" && newResourcePaths.includes(r.path_file),
        )
        .map((r) => r.id);

      const finalResourcesToDeleteIds = resourcesToDeleteIds.filter(
        (id) => !idsToRescue.includes(id),
      );

      if (finalResourcesToDeleteIds.length > 0) {
        const deletedFileResources = materi.materi_resource.filter(
          (r) => r.type === "file" && finalResourcesToDeleteIds.includes(r.id),
        );

        for (const res of deletedFileResources) {
          const isUsedElsewhere = await prisma.materi_resource.findFirst({
            where: {
              path_file: res.path_file,
              id: { notIn: finalResourcesToDeleteIds },
            },
          });

          const isReusedInNew = resourcesToCreate.some(
            (newRes) => newRes.path_file === res.path_file,
          );

          if (
            !isUsedElsewhere &&
            !isReusedInNew &&
            fs.existsSync(res.path_file)
          ) {
            fs.unlinkSync(res.path_file);
          }
        }
      }

      const transactionQueries = [
        prisma.materi.update({
          where: { id: idMateriInt },
          data: {
            title: title,
            description: description,
            visibility: visibility,
            update_at: new Date(),
          },
        }),
        prisma.materi_resource.deleteMany({
          where: {
            id: { in: finalResourcesToDeleteIds },
          },
        }),
      ];

      if (resourcesToCreate.length > 0) {
        transactionQueries.push(
          prisma.materi_resource.createMany({
            data: resourcesToCreate,
          }),
        );
      }

      await prisma.$transaction(transactionQueries);

      const finalMateri = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: { materi_resource: true },
      });

      return res.status(200).json({
        message: "Materi berhasil diperbarui.",
        data: finalMateri,
      });
    } catch (error) {
      cleanupFiles(req.files);
      console.error("Gagal mengedit materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat mengedit materi.",
        error: error.message,
      });
    }
  },
);

// =======================================================================
// DELETE MATERI BY ID
// =======================================================================
router.delete(
  "/delete-materi/:idMateri",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const { idMateri } = req.params;
    const idMateriInt = parseInt(idMateri, 10);

    if (isNaN(idMateriInt)) {
      return res.status(400).json({ message: "ID Materi tidak valid." });
    }

    try {
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData.mentor_type == "super_mentor") {
        return res
          .status(403)
          .json({ message: "Anda tidak bisa menambahkan program!" });
      }

      // 1. Cari Materi dan Verifikasi Kepemilikan
      const materi = await prisma.materi.findFirst({
        where: { id: idMateriInt },
        include: {
          program: {
            include: {
              program_mentor: {
                where: {
                  id_mentor: idMentor,
                },
              },
            },
          },
          materi_resource: true,
        },
      });

      if (!materi) {
        return res.status(404).json({ message: "Materi tidak ditemukan." });
      }

      // Verifikasi apakah mentor terdaftar di program materi ini
      const isMentorAssigned =
        materi.program && materi.program.program_mentor.length > 0;

      if (!isMentorAssigned) {
        return res.status(403).json({
          message: "Anda tidak memiliki akses untuk menghapus materi ini.",
        });
      }

      // 2. Hapus File Fisik (jika tidak digunakan oleh materi lain)
      if (materi.materi_resource && materi.materi_resource.length > 0) {
        for (const resource of materi.materi_resource) {
          if (resource.type === "file" && resource.path_file) {
            // Cek apakah file digunakan oleh materi lain (id_materi berbeda)
            const isUsedByOther = await prisma.materi_resource.findFirst({
              where: {
                path_file: resource.path_file,
                id_materi: { not: idMateriInt },
              },
            });

            // Jika tidak digunakan oleh materi lain, hapus file fisiknya
            if (!isUsedByOther) {
              const filePath = path.join(process.cwd(), resource.path_file);
              if (fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath);
                } catch (err) {
                  console.error(`Gagal menghapus file: ${filePath}`, err);
                }
              }
            }
          }
        }
      }

      // 3. Hapus Materi dari Database
      await prisma.materi.delete({
        where: { id: idMateriInt },
      });

      return res.status(200).json({
        message: "Materi berhasil dihapus beserta resource-nya.",
      });
    } catch (error) {
      console.error("Gagal menghapus materi:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat menghapus materi.",
        error: error.message,
      });
    }
  },
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
      const getIdCampus = await prisma.mentor.findUnique({
        where: {
          id: idMentor,
        },
        select: {
          id_campus: true,
        },
      });
      // 1. Cari program untuk verifikasi kepemilikan dan mendapatkan path gambar
      const programToDelete = await prisma.program.findFirst({
        where: {
          id: idProgram,
          id_campus: getIdCampus.id_campus,
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
  },
);

// get detail campus for mentor
router.get(
  "/detail-campus",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;

    try {
      // 1. Get mentor data to find id_campus
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

      // 2. Get campus detail
      const campusDetail = await prisma.campus.findUnique({
        where: {
          id: mentor.id_campus,
        },
        select: {
          id: true,
          campus_name: true,
          email: true, // Email login google
          email_campus: true, // Email resmi kampus
          path_logo: true,
          path_banner: true,
          address: true,
          description: true,
          vision_mission: true,
          website_campus: true,
          province: true,
          city: true,
          subdistrict: true,
          ward: true,
          lat: true,
          lng: true,
          major: {
            include: {
              standard_major: true,
            },
          },
        },
      });

      if (!campusDetail) {
        return res
          .status(404)
          .json({ message: "Data kampus tidak ditemukan." });
      }

      // Format URL untuk gambar
      const formattedData = { ...campusDetail };
      formattedData.logo_url = formatPathToUrl(
        formattedData.path_logo,
        BASE_URL,
      );
      formattedData.banner_url = formatPathToUrl(
        formattedData.path_banner,
        BASE_URL,
      );
      delete formattedData.path_logo;
      delete formattedData.path_banner;

      return res.status(200).json({
        message: "Detail kampus berhasil diambil.",
        data: formattedData,
      });
    } catch (error) {
      console.error("Gagal mengambil detail kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan pada server.",
        error: error.message,
      });
    }
  },
);

// edit image campus for mentor
router.put(
  "/edit-image-campus",
  authenticateUser,
  authorizeRoles(["mentor"]),
  uploadCampusImages.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    const idMentor = req.user.id;
    const { campus_name } = req.body;

    // Cek apakah ada file yang diunggah atau nama kampus yang dikirim
    if ((!req.files || Object.keys(req.files).length === 0) && !campus_name) {
      return res
        .status(400)
        .json({ message: "Tidak ada data yang dikirim untuk diperbarui." });
    }

    try {
      // 1. Ambil data mentor untuk mendapatkan id_campus
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData) {
        // Hapus file jika mentor tidak ditemukan
        if (req.files) {
          if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
          if (req.files.banner) fs.unlinkSync(req.files.banner[0].path);
        }
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      if (mentorData.mentor_type !== "super_mentor") {
        if (req.files) {
          if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
          if (req.files.banner) fs.unlinkSync(req.files.banner[0].path);
        }
        return res.status(403).json({
          message: "Anda tidak memiliki izin untuk mengedit data kampus!",
        });
      }

      const idCampus = mentorData.id_campus;

      // 2. Ambil data kampus saat ini untuk mendapatkan path gambar lama
      const currentCampus = await prisma.campus.findUnique({
        where: { id: idCampus },
        select: { path_logo: true, path_banner: true },
      });

      if (!currentCampus) {
        if (req.files) {
          if (req.files.logo) fs.unlinkSync(req.files.logo[0].path);
          if (req.files.banner) fs.unlinkSync(req.files.banner[0].path);
        }
        return res.status(404).json({ message: "Kampus tidak ditemukan." });
      }

      const dataToUpdate = {};

      // Fungsi untuk menghapus file lama
      const deleteOldFile = (filePath) => {
        if (filePath) {
          const fullPath = path.join(process.cwd(), filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlink(fullPath, (err) => {
              if (err)
                console.error(`Gagal menghapus file lama: ${fullPath}`, err);
              else console.log(`File lama berhasil dihapus: ${fullPath}`);
            });
          }
        }
      };

      // 3. Proses file logo jika ada
      if (req.files && req.files.logo) {
        const newLogoPath = req.files.logo[0].path.replace(/\\/g, "/");
        dataToUpdate.path_logo = newLogoPath;
        deleteOldFile(currentCampus.path_logo);
      }

      // 4. Proses file banner jika ada
      if (req.files && req.files.banner) {
        const newBannerPath = req.files.banner[0].path.replace(/\\/g, "/");
        dataToUpdate.path_banner = newBannerPath;
        deleteOldFile(currentCampus.path_banner);
      }

      if (campus_name) {
        dataToUpdate.campus_name = campus_name;
      }

      // 5. Update database dengan path baru jika ada data yang diupdate
      if (Object.keys(dataToUpdate).length > 0) {
        const updatedCampus = await prisma.campus.update({
          where: { id: idCampus },
          data: dataToUpdate,
        });

        return res.status(200).json({
          message: "Gambar kampus berhasil diperbarui.",
          data: updatedCampus,
        });
      } else {
        return res
          .status(400)
          .json({ message: "Tidak ada data gambar untuk diperbarui." });
      }
    } catch (error) {
      // Jika terjadi error, hapus file yang baru saja diunggah
      if (req.files) {
        if (req.files.logo && fs.existsSync(req.files.logo[0].path))
          fs.unlinkSync(req.files.logo[0].path);
        if (req.files.banner && fs.existsSync(req.files.banner[0].path))
          fs.unlinkSync(req.files.banner[0].path);
      }

      console.error("Gagal mengedit gambar kampus:", error);
      if (error.code === "P2025") {
        return res
          .status(404)
          .json({ message: "Gagal memperbarui, kampus tidak ditemukan." });
      }
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui gambar.",
        error: error.message,
      });
    }
  },
);

// edit description and vision mission campus for mentor
router.put(
  "/edit-description-campus",
  authenticateUser,
  authorizeRoles(["mentor"]),
  async (req, res) => {
    const idMentor = req.user.id;
    const { description, vision_mission } = req.body;

    // Cek apakah ada data yang dikirim untuk diperbarui
    if (description === undefined && vision_mission === undefined) {
      return res
        .status(400)
        .json({ message: "Tidak ada data yang dikirim untuk diperbarui." });
    }

    try {
      // 1. Ambil data mentor untuk mendapatkan id_campus
      const mentorData = await prisma.mentor.findUnique({
        where: { id: idMentor },
        select: { id_campus: true, mentor_type: true },
      });

      if (!mentorData) {
        return res
          .status(404)
          .json({ message: "Data mentor tidak ditemukan." });
      }

      if (mentorData.mentor_type !== "super_mentor") {
        return res.status(403).json({
          message: "Anda tidak memiliki izin untuk mengedit data kampus!",
        });
      }

      const idCampus = mentorData.id_campus;
      const dataToUpdate = {};

      if (description !== undefined) {
        dataToUpdate.description = description;
      }

      if (vision_mission !== undefined) {
        // Prisma mengharapkan objek/array untuk tipe data JSON.
        // Jika frontend mengirim string, kita perlu parse.
        let parsedVisionMission = vision_mission;
        if (typeof vision_mission === "string") {
          try {
            parsedVisionMission = JSON.parse(vision_mission);
          } catch (e) {
            return res.status(400).json({
              message: "Format vision_mission tidak valid (harus berupa JSON).",
            });
          }
        }
        dataToUpdate.vision_mission = parsedVisionMission;
      }

      const updatedCampus = await prisma.campus.update({
        where: { id: idCampus },
        data: dataToUpdate,
      });

      return res.status(200).json({
        message: "Deskripsi dan visi misi kampus berhasil diperbarui.",
        data: updatedCampus,
      });
    } catch (error) {
      console.error("Gagal mengedit deskripsi kampus:", error);
      return res.status(500).json({
        message: "Terjadi kesalahan server saat memperbarui data.",
        error: error.message,
      });
    }
  },
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
  },
);

export default router;
