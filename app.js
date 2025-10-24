import express from "express";
import morgan from "morgan";
import cors from "cors";
import menteeRoutes from "./src/routes/menteeRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import campusRoutes from "./src/routes/campusRoute.js";
import mentorRoutes from "./src/routes/mentorRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MIDDLEWARE ---
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:5173" }));

app.use("/public", express.static(path.join(process.cwd(), "uploads"))); // <-- GUNAKAN process.cwd()

app.get("/", (req, res) => {
  res.send("Hello EduMentor!");
});

// mentee route
app.use("/api/v1", menteeRoutes);

app.use("/api/v1", adminRoutes);

app.use("/api/v1", campusRoutes);

app.use("/api/v1", mentorRoutes);

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
