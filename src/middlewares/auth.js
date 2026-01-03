// const jwt = require("jsonwebtoken");
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// check token
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Akses ditolak. Tidak ada token." });
  }

  try {
    // verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // insert data from token to user
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    res.status(401).json({ message: "Token tidak valid atau kedaluwarsa." });
  }
};

export default authenticateUser;
