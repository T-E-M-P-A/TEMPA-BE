import express from "express";
import morgan from "morgan";
import { OAuth2Client } from "google-auth-library";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
const port = 8080;

const CLIENT_ID = process.env.CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;

// --- MIDDLEWARE ---
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.options("/api/v1/login-mentee", (req, res) => {
  res.sendStatus(200);
});

app.post("/api/v1/login-mentee", async (req, res) => {
  const token = req.body.credential;

  if (!token) {
    return res.status(400).json({ error: "No credential token provided." });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error("Invalid token payload.");
    }

    const { name, sub, email } = payload;

    const jwtPayload = {
      sub: sub, // Unique ID from Google
      email: email,
      name: name,
      role: "mentee",
    };

    const signedJwtToken = jwt.sign(
      jwtPayload,
      JWT_SECRET,
      { expiresIn: "1d" } // Token availlable in 1 day
    );

    res.status(200).json({
      message: "Login successful!",
      data: {
        jwtToken: signedJwtToken,
        fullName: name,
        uniqueId: sub,
        email: email,
        note: "Mantapppp mas broo",
      },
    });
  } catch (error) {
    console.error("Token verification failed:", error.message);
    res.status(401).json({ error: "Authentication failed. Invalid token." });
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
