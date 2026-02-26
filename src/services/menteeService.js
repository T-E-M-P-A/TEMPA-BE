import { findOrCreateUser } from "../controllers/findOrCreateUser.js"; // Sesuaikan path
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import prisma from "../../prisma/client.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import generateContentWithRetry from "../controllers/generateContentWithRetry.js";
import { AppError } from "../utils/customError.js";
const client = new OAuth2Client(process.env.CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

// Oauth mentee
export const authenticateGoogleUser = async (idToken) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) throw new Error("Invalid token payload.");

  const { name, email, email_verified } = payload;

  if (!email_verified) {
    // Di Service, gunakan throw Error, jangan gunakan res.status (karena res hanya ada di controller)
    const error = new Error("Email Google belum diverifikasi.");
    error.status = 400;
    throw error;
  }

  const userRecord = await findOrCreateUser(payload);

  const jwtPayload = {
    id: userRecord.id,
    username: name,
    email: email,
    role: "mentee",
  };

  const signedJwtToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: "1d" });

  // return all object for controller
  return {
    signedJwtToken,
    name,
    localUserId: userRecord.id,
    email,
    userRecord,
  };
};

// get the program that the mentee has registered for
export const getProgramMentee = async (menteeId) => {
  const menteeProgressWithProgram = await prisma.mentee_progress.findMany({
    where: {
      id_mentee: menteeId,
    },
    select: {
      id: true,
      completion_status: true,
      final_score: true,

      // get program by id from table program
      program: {
        select: {
          id: true,
          program_name: true,
          description: true,
          start_program_date: true,
          end_program_date: true,
          capacity: true,
          path_gambar: true,
          onsiteLocationName: true,
          type_sesi: true,

          // get major program
          campus_program_id_majorTocampus: {
            select: {
              id: true,

              // get major name
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

  const interest = await prisma.mentee_major_interest.findFirst({
    where: {
      id_mentee: menteeId,
    },
  });

  const responseAi = await prisma.recomendation_majors.findFirst({
    where: {
      id_mentee: menteeId,
    },
  });

  // console.log(responseAi, interest);

  // Output always array
  const results = Array.isArray(menteeProgressWithProgram)
    ? menteeProgressWithProgram
    : [];

  // if program null
  if (results.length === 0) {
    return "Mentee belum terdaftar di program manapun.";
  }

  const programs = menteeProgressWithProgram.map((item) => {
    // --- Langkah 1: Logika Pembersihan Path (DIPINDAHKAN KE DALAM) ---
    const rawPath = item.program.path_gambar;
    let finalPath = rawPath;

    if (finalPath) {
      // 1. Bersihkan slash di depan jika ada (Dari '/uploads/...')
      if (finalPath.startsWith("/")) {
        finalPath = finalPath.substring(1);
      }

      // 2. POTONG string "uploads/" di awal path (Karena Express sudah memetakan folder 'uploads')
      if (finalPath.startsWith("uploads/")) {
        finalPath = finalPath.substring("uploads/".length);
      }
    }

    return {
      progress_id: item.id,
      completion_status: item.completion_status,
      final_score: item.final_score,
      // major_interest_status: !!interest,

      program_details: {
        id: item.program.id,
        program_name: item.program.program_name,
        description: item.program.description,
        start_date: item.program.start_program_date,
        end_date: item.program.end_program_date,
        capacity: item.program.capacity,
        onsiteLocationName: item.program.onsiteLocationName,
        type_sesi: item.program.type_sesi,

        // KOREKSI: Gunakan finalPath yang sudah dipotong dan dibersihkan
        image_url: finalPath ? `${BASE_URL}/public/${finalPath}` : null,

        // Gabungkan data relasi
        sesi_program: item.program.sesi_program,
        major_name:
          item.program.campus_program_id_majorTocampus.standard_major
            .major_name,
      },
    };
  });

  return {
    message: "Daftar program mentee berhasil diambil.",
    data: programs,
    major_interest_status: !interest && !!responseAi,
  };
};

// get all program
export const getAllProgram = async () => {
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
      item.campus_program_id_majorTocampus?.standard_major?.major_name || null;
    newItem.campus_name =
      item.campus_program_id_campusTocampus?.campus_name || null;

    // Hapus objek relasi yang panjang jika sudah tidak diperlukan
    delete newItem.campus_program_id_majorTocampus;
    delete newItem.campus_program_id_campusTocampus;

    return newItem;
  });
  // console.log(formatGetAllProgram);

  // Mengirimkan data sebagai respons
  return {
    message: "Data Berhasil Dipanggil",
    data: formatGetAllProgram,
  };
};

// get detail program
export const detailProgram = async (idProgram) => {
  const detailProgram = await prisma.program.findUnique({
    where: {
      id: parseInt(idProgram),
    },
    include: {
      campus_program_id_campusTocampus: {
        select: {
          id: true,
          campus_name: true,
          province: true,
          city: true,
          email: true,
          path_logo: true,
          path_banner: true,
          badge: true,
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
    return "Program tidak ditemukan.";
  }

  const item = detailProgram;

  const majorName =
    item.campus_program_id_majorTocampus.standard_major.major_name;

  const badge = item.campus_program_id_campusTocampus.badge;

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

  formatGetDetailProgram.major_name = majorName;
  delete formatGetDetailProgram.campus_program_id_majorTocampus;

  formatGetDetailProgram.badge = badge;

  // a. Hapus path_gambar lama dan tambahkan image_url baru ke level atas
  delete formatGetDetailProgram.path_gambar;
  formatGetDetailProgram.image_url = imageUrl;

  // b. Hapus path_logo dan path_banner lama dan tambahkan URL baru ke properti kampus
  delete formatGetDetailProgram.campus_program_id_campusTocampus.path_logo;
  delete formatGetDetailProgram.campus_program_id_campusTocampus.path_banner;

  // Tambahkan URL yang sudah diformat
  formatGetDetailProgram.campus_program_id_campusTocampus.logo_url = logoUrl;
  formatGetDetailProgram.campus_program_id_campusTocampus.banner_url =
    bannerUrl;

  // console.log(formatGetDetailProgram);

  return {
    message: "Detail program ditemukan",
    data: formatGetDetailProgram,
  };
};

// get all campus
export const getCampus = async () => {
  const getAllCampus = await prisma.campus.findMany({
    where: {
      verification_status: "accepted",
    },
    select: {
      id: true,
      campus_name: true,
      address: true,
      path_logo: true,
      path_banner: true,
      province: true,
      city: true,
      badge: true,
    },
  });

  if (!getAllCampus) {
    return "Data tidak ditemukan";
  }

  const formatGetAllCampus = getAllCampus.map((item) => {
    // get raw path
    const rawLogo = item.path_logo;
    const rawBanner = item.path_banner;

    // format using function formatPathToUrl
    const logoUrl = formatPathToUrl(rawLogo, BASE_URL);
    const bannerUrl = formatPathToUrl(rawBanner, BASE_URL);

    // copy all data object
    const newItem = { ...item };

    // delete old path before format
    delete newItem.path_logo;
    delete newItem.path_banner;

    // add new path format to the object
    newItem.logo_url = logoUrl;
    newItem.banner_url = bannerUrl;

    return newItem;
  });

  // console.log(formatGetAllCampus);

  return {
    message: "Data campus ditemukan",
    data: formatGetAllCampus,
  };
};

// get detail campus
export const detailCampus = async (idCampus) => {
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
      province: true,
      city: true,
      subdistrict: true,
      ward: true,
      lat: true,
      lng: true,
      description: true,
      verification_status: false,
      sub_google_id: false,
      vision_mission: true,
      badge: true,

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
    return "Kampus tidak ditemukan.";
  }

  let formattedCampus = { ...detailCampus };

  // delete old path_logo and add new url logo_url
  formattedCampus.logo_url = formatPathToUrl(
    formattedCampus.path_logo,
    BASE_URL,
  );
  delete formattedCampus.path_logo;

  // delete old path_banner and add new url banner_url
  formattedCampus.banner_url = formatPathToUrl(
    formattedCampus.path_banner,
    BASE_URL,
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
          BASE_URL,
        );
        delete formattedProgram.path_gambar;

        return formattedProgram;
      });
  }

  // console.log(formattedCampus);

  return {
    message: "Detail campus ditemukan",
    data: formattedCampus,
  };
};

// register mentee program
export const registerProgram = async (idMentee, idProgramInt) => {
  if (!idProgramInt || !idMentee) {
    return {
      message: "ID Program atau ID Mentee tidak ditemukan.",
    };
  }

  // check if mentee is already register to program
  const existingEnrollment = await prisma.mentee_progress.findFirst({
    where: {
      id_mentee: idMentee,
      id_program: idProgramInt,
    },
  });

  // if already register program
  if (existingEnrollment) {
    return {
      message: `Anda sudah mendaftar program tersebut!`,
      data: existingEnrollment,
    };
  }

  // Check program status and capacity
  const programData = await prisma.program.findUnique({
    where: {
      id: idProgramInt,
    },
    select: {
      capacity: true,
      start_regis_date: true,
      end_regis_date: true,
      start_program_date: true,
      end_program_date: true,
    },
  });

  if (!programData) {
    return { message: "Program tidak ditemukan." };
  }

  if (new Date(programData.start_regis_date) > new Date()) {
    return {
      message: "Pendaftaran belum dibuka!",
    };
  }

  if (new Date(programData.end_regis_date) < new Date()) {
    return {
      message: "Pendaftaran sudah tutup!",
    };
  }

  if (new Date(programData.end_program_date) < new Date()) {
    return {
      message: "Program sudah tutup/selesai!",
    };
  }

  if (programData.capacity <= 0) {
    return {
      message: "Kuota program sudah penuh!",
    };
  }

  // Register program and decrement capacity
  const registerProgram = await prisma.$transaction(async (tx) => {
    const newProgress = await tx.mentee_progress.create({
      data: {
        completion_status: "on_going",
        completion_date: null,
        id_mentee: idMentee,
        id_program: idProgramInt,
        create_at: new Date(),
      },
    });

    await tx.program.update({
      where: { id: idProgramInt },
      data: {
        capacity: { decrement: 1 },
      },
    });

    return newProgress;
  });
  // console.log(registerProgram);

  return {
    message: `Pendaftaran berhasil!`,
    data: registerProgram,
  };
};

// get majors
export const getMajors = async () => {
  const allMajors = await prisma.standard_major.findMany({});

  if (!allMajors) {
    return { message: "Data Jurusan tidak ada." };
  }

  const formattedMajors = allMajors.map((major) => {
    const bannerUrl = formatPathToUrl(major.path_banner, BASE_URL);
    const newMajor = { ...major, banner_url: bannerUrl };
    delete newMajor.path_banner;
    return newMajor;
  });

  // console.log(formattedMajors);

  return {
    message: "Data Jurusan ditemukan",
    data: formattedMajors,
  };
};

// get detail major
export const detailMajor = async (majorName) => {
  const detailMajor = await prisma.standard_major.findFirst({
    where: {
      major_name: majorName,
    },
    include: {
      major: {
        include: {
          campus: {
            select: {
              id: true,
              campus_name: true,
              path_banner: true,
            },
          },
          program_program_id_majorTocampus: {
            include: {
              campus_program_id_majorTocampus: {
                include: {
                  standard_major: {
                    select: {
                      id: true,
                      major_name: true,
                      logo_name: true,
                      path_banner: true,
                    },
                  },
                  campus: {
                    select: {
                      campus_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Cek jika jurusan tidak ditemukan
  if (!detailMajor) {
    return {
      message: "Jurusan tidak ditemukan",
      data: null,
    };
  }

  // Format data untuk menyertakan URL gambar yang valid
  const formattedDetailMajor = {
    ...detailMajor,
    banner_url: formatPathToUrl(detailMajor.path_banner, BASE_URL),
    campus: detailMajor.major.map((m) => {
      // Format Banner Kampus
      const campusBannerUrl = formatPathToUrl(m.campus?.path_banner, BASE_URL);

      // Format Gambar Program
      const formattedPrograms = m.program_program_id_majorTocampus.map(
        (prog) => {
          const programImageUrl = formatPathToUrl(prog.path_gambar, BASE_URL);
          const newProg = { ...prog, image_url: programImageUrl };
          delete newProg.path_gambar;
          return newProg;
        },
      );

      const newMajor = {
        ...m,
        campus: {
          ...m.campus,
          banner_url: campusBannerUrl,
        },
        program_program_id_majorTocampus: formattedPrograms,
      };

      if (newMajor.campus) {
        delete newMajor.campus.path_banner;
      }

      return newMajor;
    }),
  };

  delete formattedDetailMajor.path_banner;

  return {
    message: "Detail jurusan berhasil diambil",
    data: formattedDetailMajor,
  };
};

// recomendation majors
export const recomendationMajors = async (menteeId, reqBody) => {
  const { q1, q2, q3, q4, q5, q6, q7, q8, q9, q10 } = reqBody;

  const checkResponse = await prisma.recomendation_majors.findFirst({
    where: {
      id_mentee: menteeId,
    },
  });

  // check if mentee already assign form
  if (checkResponse) {
    throw new AppError(
      "Akses Ditolak. Anda hanya diizinkan mengisi tes jurusan satu kali!",
      403,
    );
  }

  const requiredFields = [
    { key: "q1", name: "Minat Akademik Inti" },
    { key: "q2", name: "Aktivitas Pilihan" },
    { key: "q3", name: "Motivasi Karir" },
    { key: "q4", name: "Preferensi Lingkungan Kerja" },
    { key: "q5", name: "Kekuatan Diri" },
    { key: "q6", name: "Tantangan yang Disukai" },
    { key: "q7", name: "Toleransi Risiko & Aturan" },
    { key: "q8", name: "Pentingnya Gaji (Skala 1-5)" },
    { key: "q9", name: "Jurusan yang Sudah Ada di Pikiran" },
    { key: "q10", name: "Data Kuantitatif/Kualitatif" },
  ];

  const missingFields = [];

  requiredFields.forEach((field) => {
    const value = reqBody[field.key];

    // if null, undefined, or string null
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    ) {
      missingFields.push(field.name);
    }
  });

  if (missingFields.length > 0) {
    throw new AppError("Validasi Gagal: Semua pertanyaan wajib diisi.", 400);
  }

  // get all data majors for ai
  const majors = await prisma.standard_major.findMany({
    select: {
      major_name: true,
    },
  });

  // conversion result from majors to string/array for AI
  const availableMajors = majors.map((m) => m.major_name).join(", ");

  // Buat prompt
  const userProfile = `
        [1] Minat Akademik Inti: ${q1}
        [2] Aktivitas Pilihan: ${q2}
        [3] Motivasi Karir: ${q3}
        [4] Preferensi Lingkungan Kerja: ${q4}
        [5] Kekuatan Diri: ${q5}
        [6] Tantangan yang Disukai: ${q6}
        [7] Toleransi Risiko & Aturan: ${q7}
        [8] Pentingnya Gaji (Skala 1-5): ${q8}
        [9] Jurusan yang Sudah Ada di Pikiran: ${q9}
        [10] Data Kuantitatif/Kualitatif: ${q10}
      `;

  const systemInstruction = `Anda adalah Konselor Karir Ahli di Indonesia. Tugas Anda adalah menganalisis profil pengguna berikut dan merekomendasikan 2 hingga 3 jurusan kuliah yang paling sesuai.

        Anda harus membatasi rekomendasi hanya pada jurusan yang tersedia dalam daftar berikut: ${availableMajors}.

        Berikan keluaran Anda dalam format JSON array of objects dengan struktur ini:
        [
          {
            "jurusan": "Nama Jurusan (HARUS ada di daftar yang tersedia)",
            "kesesuaian": "Penjelasan ringkas (1-2 kalimat) mengapa jurusan ini cocok dengan profil pengguna.",
            "profesi_relevan": ["Profesi A", "Profesi B"]
          },
          // ... objek kedua
          // ... objek ketiga (opsional)
        ]
        `;

  // config for respons JSON
  const modelConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          jurusan: { type: "STRING" },
          kesesuaian: { type: "STRING" },
          profesi_relevan: { type: "ARRAY", items: { type: "STRING" } },
        },
      },
    },
  };

  try {
    // get eai
    const response = await generateContentWithRetry(
      modelConfig,
      userProfile,
      systemInstruction,
    );

    const aiRecommendations = JSON.parse(response.text);

    // save response to database
    const saveResponseAi = await prisma.recomendation_majors.create({
      data: {
        response_ai: aiRecommendations,
        id_mentee: menteeId,
      },
    });

    // console.log("Rekomendasi AI:", aiRecommendations);

    return {
      message: "Rekomendasi jurusan berhasil dibuat.",
      data: aiRecommendations,
    };
  } catch (error) {
    console.error("Kesalahan AI Service:", error);

    let message = "Terjadi kesalahan internal saat memproses rekomendasi.";
    if (error.message.includes("Gagal mendapatkan rekomendasi AI")) {
      message = error.message; // Pesan dari fungsi retry kamu
    }

    throw new AppError(message, 500);
  }
};
