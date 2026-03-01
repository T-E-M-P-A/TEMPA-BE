import prisma from "../../prisma/client.js";
import { findOrCreateCampus } from "../controllers/findOrCreateUser.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/customError.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// root proyek (TEMPA-BE)
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Path to Interpreter Python VENV (Windows)
// const PYTHON_VENV_PATH = path.join(
//   PROJECT_ROOT,
//   "venv_pddikti",
//   "Scripts",
//   "python.exe"
// );

// uncomment if your system is linux or macos
const PYTHON_VENV_PATH = path.join(
  PROJECT_ROOT,
  "venv_pddikti",
  "bin",
  "python3",
);

// Path Script Python
const PYTHON_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "controllers",
  "dataCampus.py",
);

// Path Script Python untuk Mentor
const PYTHON_MENTOR_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "controllers",
  "dataMentor.py",
);

// oauth login campus
export const loginCampus = async (token) => {
  if (!token) {
    throw new AppError("No credential token provided.", 400);
  }

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error("Invalid token payload.");
  }

  const { name, sub, email, email_verified } = payload;

  if (!email_verified) {
    throw new AppError("Email Google belum diverifikasi.", 401);
  }

  // get id user or add user
  const userRecord = await findOrCreateCampus(payload);

  // get user ID
  const localUserId = userRecord.id;

  const verifData = await prisma.campus.findFirst({
    where: {
      id: localUserId,
    },
    select: {
      verification_status: true,
      campus_name: true,
    },
  });

  // console.log(verifData);

  const jwtPayload = {
    id: localUserId, // id user
    username: name,
    email: email,
    role: "campus",
    verif: verifData,
  };

  // Buat token JWT
  const signedJwtToken = jwt.sign(
    jwtPayload,
    JWT_SECRET,
    { expiresIn: "1d" }, // expired in 1 day
  );

  return {
    message: "Login successful!",
    data: {
      token: signedJwtToken,
      fullName: name,
      uniqueId: localUserId,
      email: email,
    },
  };
};

// register campus
export const registerCampus = async (reqBody, idCampus) => {
  const {
    campusName,
    emailCampus,
    description,
    websiteCampus,
    province,
    city,
    subdistrict,
    ward,
    lat,
    lng,
    isCampusVerifiedByApi,
  } = reqBody;

  const requiredFields = [
    "campusName",
    "emailCampus",
    "description",
    "websiteCampus",
    "province",
    "city",
    "subdistrict",
    "ward",
    "lat",
    "lng",
  ];

  // check if req is null
  for (const field of requiredFields) {
    const value = reqBody[field];

    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      throw new AppError(
        `Gagal: Kolom '${field}' wajib diisi dan tidak boleh kosong.`,
        400,
      );
    }
  }

  // check format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailCampus)) {
    throw new AppError("Gagal: Format email tidak valid.", 400);
  }

  try {
    // convertion to float
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    // check if lat and lng value is float
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new AppError(
        "Gagal: Latitude (lat) dan Longitude (lng) harus berupa angka yang valid.",
        400,
      );
    }

    let checkValidationApi = null;

    if (isCampusVerifiedByApi) {
      checkValidationApi = "accepted";
    } else {
      checkValidationApi = "pending";
    }

    // Update data detail kampus
    const saveDataCampus = await prisma.campus.update({
      where: {
        id: idCampus,
      },
      data: {
        campus_name: campusName,
        email_campus: emailCampus,
        description: description,
        website_campus: websiteCampus,
        province: province,
        city: city,
        subdistrict: subdistrict,
        ward: ward,
        lat: parsedLat,
        lng: parsedLng,
      },
    });

    // Update status verification
    const changeVerificationStatus = await prisma.campus.update({
      where: {
        id: idCampus,
      },
      data: {
        verification_status: checkValidationApi,
      },
    });

    return {
      message: "Campus Berhasil Register",
      data: saveDataCampus,
    };
  } catch (error) {
    console.error("Prisma Error:", error);

    // error unique email
    if (error.code === "P2002") {
      throw new AppError(
        "Email kampus sudah terdaftar (pelanggaran unik).",
        409,
      );
    }

    // error validation input
    if (error.name === "PrismaClientValidationError") {
      throw new AppError(
        "Kesalahan validasi input data. Cek fields yang wajib diisi.",
        400,
      );
    }
  }
};

// edit data campus
export const editDataCampus = async (reqBody, idCampus) => {
  const {
    campusName,
    emailCampus,
    description,
    websiteCampus,
    province,
    city,
    subdistrict,
    ward,
    lat,
    lng,
  } = reqBody;

  const requiredFields = [
    "campusName",
    "emailCampus",
    "description",
    "websiteCampus",
    "province",
    "city",
    "subdistrict",
    "ward",
    "lat",
    "lng",
  ];

  // check if req is null
  for (const field of requiredFields) {
    const value = reqBody[field];

    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      throw new AppError(
        `Gagal: Kolom '${field}' wajib diisi dan tidak boleh kosong.`,
        400,
      );
    }
  }

  // check format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailCampus)) {
    throw new AppError("Gagal: Format email tidak valid.", 400);
  }

  try {
    // convertion to float
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    // check if lat and lng value is float
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new AppError(
        "Gagal: Latitude (lat) dan Longitude (lng) harus berupa angka yang valid.",
        400,
      );
    }

    // Update data detail kampus
    const updateDataCampus = await prisma.campus.update({
      where: {
        id: idCampus,
      },
      data: {
        campus_name: campusName,
        email_campus: emailCampus,
        description: description,
        website_campus: websiteCampus,
        province: province,
        city: city,
        subdistrict: subdistrict,
        ward: ward,
        lat: parsedLat,
        lng: parsedLng,
        verification_status: "pending",
      },
    });

    return {
      message: "Data kampus berhasil diperbarui",
      data: updateDataCampus,
    };
  } catch (error) {
    console.error("Prisma Error:", error);

    // error unique email
    if (error.code === "P2002") {
      throw new AppError(
        "Email kampus sudah terdaftar (pelanggaran unik).",
        409,
      );
    }
    // error validation input
    if (error.name === "PrismaClientValidationError") {
      throw new AppError("Kesalahan validasi input data.", 400);
    }
  }
};

// check verification campus
export const checkVerificationCampus = async (idCampus) => {
  const getVerification = await prisma.campus.findFirst({
    where: {
      id: idCampus,
    },
    select: {
      verification_status: true,
    },
  });

  // console.log(getVerification);

  if (!getVerification) {
    throw new AppError("Data kampus tidak ditemukan.", 404);
  }

  return {
    message: "Data berhasil didapatkan",
    data: getVerification,
  };
};

// get detail verification campus (For Edit Form)
export const getDetailVerificationCampus = async (idCampus) => {
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
    throw new AppError("Data kampus tidak ditemukan.", 404);
  }

  return {
    message: "Detail kampus berhasil diambil",
    data: campus,
  };
};

// get all program by campus id
export const getAllProgramByCampusId = async (idCampus) => {
  const getProgram = await prisma.program.findMany({
    where: {
      id_campus: idCampus,
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
      sesi_program: {
        select: {
          type_sesi: true,
          sesi_date: true,
        },
      },
    },
    orderBy: {
      create_at: "desc",
    },
  });

  const formattedPrograms = getProgram.map((item) => {
    const imageUrl = formatPathToUrl(item.path_gambar, BASE_URL);

    const majorName =
      item.campus_program_id_majorTocampus?.standard_major?.major_name || null;

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

  if (formattedPrograms.length === 0) {
    return {
      message: "Kampus belum memiliki program yang terdaftar.",
      data: [],
    };
  }

  return {
    message: "Data program kampus berhasil didapatkan.",
    data: formattedPrograms,
  };
};

// get detail program
export const getDetailProgram = async (idCampus, idProgram) => {
  const parsedIdProgram = parseInt(idProgram);

  // validation id program
  if (isNaN(parsedIdProgram)) {
    throw new AppError("ID Program tidak valid. Harus berupa angka.", 400);
  }

  const getCampusSubscription = await prisma.campus_subscription.findFirst({
    where: {
      id_campus: idCampus,
      id_package: {
        in: [1, 2],
      },
      expired_date: {
        gte: new Date(),
      },
    },
  });

  const detailProgram = await prisma.program.findUnique({
    where: {
      id: parsedIdProgram,
      id_campus: idCampus,
    },
    include: {
      // get mentor where handle the program
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
      // get program major
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
      // get matery program
      materi: {
        select: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          // get resource matery
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
      // total mentee where register program
      _count: {
        select: {
          mentee_progress: true,
        },
      },
    },
  });

  if (!detailProgram) {
    throw new AppError(
      "Program tidak ditemukan atau bukan milik kampus ini.",
      404,
    );
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

  // formattedDetail
  const formattedDetail = {
    ...item,
    image_url: imageUrl,
    seen: !getCampusSubscription ? false : detailProgram.seen,
    major_name:
      item.campus_program_id_majorTocampus?.standard_major?.major_name || null,
    registered_mentees: item._count?.mentee_progress || 0,
    // format data for mentee list
    free_trial: getCampusSubscription ? true : false,
    send_mail: getCampusSubscription?.id_package === 2 ? true : false,
    mentee_list: item.mentee_progress.map((mp) => ({
      id: mp.mentee?.id,
      username: mp.mentee?.username,
      email: getCampusSubscription?.id_package === 2 ? mp.mentee?.email : null,
      gender: mp.mentee?.gender,
      completion_status: mp.completion_status,
      final_score: mp.final_score,
      create_at: mp.create_at,
      city_distribution: formattedCityDistribution,
      education_status_distribution: formattedEducationStatus,
    })),
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

  // console.log(formattedDetail);

  return {
    message: "Detail program berhasil ditemukan.",
    data: formattedDetail,
  };
};

// get all mentee where registered program
export const getAllMenteeWhereRegisteredProgram = async (
  idCampus,
  idProgram,
) => {
  const programData = await prisma.program.findFirst({
    where: {
      id: parseInt(idProgram),
      id_campus: idCampus,
    },
    select: {
      mentee_progress: {
        select: {
          mentee: {
            select: {
              username: true,
              email: true,
            },
          },
        },
      },
      _count: {
        select: {
          mentee_progress: true,
        },
      },
    },
  });

  if (!programData) {
    throw new AppError(
      "Program tidak ditemukan atau bukan milik kampus ini.",
      404,
    );
  }

  const formattedData = {
    total_mentee: programData._count.mentee_progress,
    mentees: programData.mentee_progress.map((mp) => ({
      username: mp.mentee?.username,
      email: mp.mentee?.email,
    })),
  };

  // console.log(formattedData);

  return {
    message: "Data program beserta detail mentee berhasil diambil",
    data: formattedData,
  };
};

// get program feedback
export const getProgramFeedback = async (idCampus, idProgram) => {
  if (isNaN(idProgram)) {
    throw new AppError("ID Program tidak valid. Harus berupa angka.", 400);
  }

  const program = await prisma.program.findFirst({
    where: {
      id: idProgram,
      id_campus: idCampus,
    },
  });

  if (!program) {
    throw new AppError(
      "Program tidak ditemukan atau bukan milik kampus ini.",
      404,
    );
  }

  const feedbacks = await prisma.program_feedback.findMany({
    where: {
      id_program: idProgram,
    },
    include: {
      mentee: {
        select: {
          username: true,
          email: true,
        },
      },
    },
  });

  const formattedFeedbacks = feedbacks.map((item) => ({
    id: item.id,
    rating: item.rating,
    evaluation: item.evaluation,
    username: item.mentee?.username || "Unknown",
    email: item.mentee?.email,
  }));

  return {
    message: "Data feedback program berhasil diambil.",
    data: formattedFeedbacks,
  };
};

// get campus name from api
export const getNameCampus = async (campusName) => {
  if (!campusName) {
    throw new AppError("Parameter 'campusName' diperlukan.", 400);
  }

  // Gunakan spawn untuk menjalankan proses Python
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(PYTHON_VENV_PATH, [
      PYTHON_SCRIPT_PATH,
      campusName,
    ]);

    let outputData = "";
    let errorData = "";

    pythonProcess.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(
          `Python script exited code ${code}. Stderr: ${errorData}`,
        );

        try {
          const errorResult = JSON.parse(outputData);
          // Gunakan reject bukan throw di dalam callback Promise
          return reject(
            new AppError(errorResult.message || "Internal Server Error", 500),
          );
        } catch (e) {
          return reject(
            new AppError("Gagal menjalankan validasi kampus.", 500),
          );
        }
      }

      try {
        const result = JSON.parse(outputData);
        // resolve akan mengirim data kembali ke Controller
        resolve(result);
      } catch (e) {
        reject(new AppError("Gagal memproses hasil dari Python.", 500));
      }
    });

    // Tangani jika proses python gagal dijalankan sama sekali (misal path salah)
    pythonProcess.on("error", (err) => {
      reject(new AppError(`Gagal menjalankan Python: ${err.message}`, 500));
    });
  });
};

// get program campus data for chart
export const getProgramCampusDataChart = async (idCampus) => {
  const getProgramCampus = await prisma.program.findMany({
    where: {
      id_campus: idCampus,
    },
    select: {
      id: true,
      program_name: true,
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
    // Total mentee diambil dari hasil perhitungan _count
    total_mentee: program._count.mentee_progress,
  }));

  // console.log(programsWithMenteeCount);

  return {
    message: "Data program beserta total mentee berhasil diambil",
    data: programsWithMenteeCount,
  };
};

// create program
export const createProgram = async (reqBody, idCampus, reqFile) => {
  // 1. Validasi awal
  if (!reqFile) {
    throw new AppError("Gambar program wajib diunggah.", 400);
  }

  // Destructuring dari reqBody (Argumen pertama dari controller)
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
    benefits,
    terms,
    location_name,
    mapLat,
    mapLng,
  } = reqBody;

  // 2. Validasi field wajib
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
      // Jika error di sini, file harus dihapus
      if (reqFile) fs.unlinkSync(reqFile.path);
      throw new AppError(`Field '${field}' wajib diisi.`, 400);
    }
  }

  try {
    const majorId = parseInt(majorName, 10);

    const major = await prisma.major.findFirst({
      where: {
        id_standard_major: majorId,
        id_campus: parseInt(idCampus),
      },
    });

    // console.log(majorId);
    if (!major) {
      throw new AppError("Jurusan tidak ditemukan atau bukan milik Anda.", 404);
    }

    // Helper JSON Parser
    const parseJsonOrWrapInArray = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (e) {
          return value
            .split(",")
            .map((i) => i.trim())
            .filter((i) => i);
        }
      }
      return Array.isArray(value) ? value : [];
    };

    const programData = {
      program_name: name,
      description: description,
      start_program_date: new Date(startDateProgram),
      end_program_date: new Date(endDateProgram),
      start_regis_date: new Date(startRegisDate),
      end_regis_date: new Date(endRegisDate),
      capacity: parseInt(capacity, 10),
      id_campus: parseInt(idCampus),
      id_major: major.id,
      path_gambar: reqFile.path.replace(/\\/g, "/"), // Gunakan reqFile
      benefit: parseJsonOrWrapInArray(benefits),
      terms_and_conditions: parseJsonOrWrapInArray(terms),
      type_sesi: programType,
      sesi_start: new Date(`1970-01-01T${startTime}:00`),
      sesi_end: new Date(`1970-01-01T${endTime}:00`),
      visibility: visibility,
      create_at: new Date(),
      update_at: new Date(),
    };

    if (programType === "onsite") {
      if (!location_name || !mapLat || !mapLng) {
        throw new AppError("Data lokasi onsite tidak lengkap.", 400);
      }
      programData.onsiteLocationName = location_name;
      programData.lat = parseFloat(mapLat);
      programData.lng = parseFloat(mapLng);
    }

    const newProgram = await prisma.program.create({ data: programData });

    return { message: "Program berhasil dibuat.", data: newProgram };
  } catch (error) {
    // HAPUS FILE JIKA GAGAL DB
    if (reqFile && fs.existsSync(reqFile.path)) {
      fs.unlinkSync(reqFile.path);
    }

    if (error instanceof AppError) throw error;
    throw new AppError(error.message || "Gagal membuat program.", 500);
  }
};

export const updateProgram = async (idCampus, id, reqBody, reqFile) => {
  const idProgram = parseInt(id, 10);

  if (isNaN(idProgram)) {
    throw new AppError("ID Program tidak valid. Harus berupa angka.", 400);
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
  } = reqBody;
  // console.log(req.body);
  try {
    // 1. Cari program yang akan di-edit untuk verifikasi dan mendapatkan path gambar lama
    const existingProgram = await prisma.program.findFirst({
      where: {
        id: idProgram,
        id_campus: idCampus, // Pastikan program milik kampus yang sedang login
      },
    });

    if (!existingProgram) {
      throw new AppError(
        "Program tidak ditemukan atau Anda tidak berhak mengeditnya.",
        404,
      );
    }

    // 2. Validasi Major ID baru (jika diubah)
    const majorId = parseInt(majorName, 10);
    // console.log(majorName);
    if (isNaN(majorId)) {
      throw new AppError("Format ID Jurusan tidak valid.", 400);
    }

    const major = await prisma.major.findFirst({
      where: {
        id_campus: parseInt(idCampus),
        OR: [{ id: majorId }, { id_standard_major: majorId }],
      },
    });

    // console.log(`id jurusan: ${majorId}, id campus: ${idCampus}`);
    // console.log(major);

    if (!major) {
      throw new AppError("Jurusan tidak ditemukan atau bukan milik Anda.", 404);
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
    if (reqFile) {
      // Hapus gambar lama jika ada
      if (existingProgram.path_gambar) {
        const oldImagePath = path.join(
          process.cwd(),
          existingProgram.path_gambar,
        );
        if (fs.existsSync(oldImagePath)) {
          fs.unlink(oldImagePath, (err) => {
            if (err)
              console.error("Gagal menghapus gambar lama:", oldImagePath, err);
            else console.log("Gambar lama berhasil dihapus:", oldImagePath);
          });
        }
      }
      // Tambahkan path gambar baru ke data yang akan di-update
      dataToUpdate.path_gambar = reqFile.path.replace(/\\/g, "/");
    }

    // 5. Handle data kondisional untuk program 'onsite'
    if (programType === "onsite") {
      const parsedLat = parseFloat(mapLat);
      const parsedLng = parseFloat(mapLng);

      if (!onsiteLocationName || isNaN(parsedLat) || isNaN(parsedLng)) {
        throw new AppError(
          "Untuk program onsite, nama lokasi, latitude, dan longitude wajib diisi.",
          400,
        );
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

    return {
      message: "Program berhasil diperbarui.",
      data: updatedProgram,
    };
  } catch (error) {
    // HAPUS FILE JIKA GAGAL DB
    if (reqFile && fs.existsSync(reqFile.path)) {
      fs.unlinkSync(reqFile.path);
    }

    if (error instanceof AppError) throw error;
    throw new AppError(error.message || "Gagal membuat program.", 500);
  }
};
