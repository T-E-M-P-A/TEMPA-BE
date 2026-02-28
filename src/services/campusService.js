import prisma from "../../prisma/client.js";
import { findOrCreateCampus } from "../controllers/findOrCreateUser.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/customError.js";
import formatPathToUrl from "../controllers/formatPathUrl.js";

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.API_BASE_URL;

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
