import prisma from "../../prisma/client.js";
import { findOrCreateCampus } from "../controllers/findOrCreateUser.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/customError.js";

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
