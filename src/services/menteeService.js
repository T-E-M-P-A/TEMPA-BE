import { findOrCreateUser } from "../controllers/findOrCreateUser.js"; // Sesuaikan path
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
const client = new OAuth2Client(process.env.CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;

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
