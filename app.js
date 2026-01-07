import express from "express";
import morgan from "morgan";
import cors from "cors";
import menteeRoutes from "./src/routes/menteeRoutes.js";
import paymentGateway from "./src/routes/paymentGateway.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import campusRoutes from "./src/routes/campusRoute.js";
import mentorRoutes from "./src/routes/mentorRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
const port = 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MIDDLEWARE ---

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: (req, res) => {
    if (req.user) return 1000;
    return 100;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.",
  },
});

app.use(limiter);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:5173" }));

app.use("/public", express.static(path.join(process.cwd(), "uploads")));

// mentee route
app.use("/api/v1", menteeRoutes);

// admin route
app.use("/api/v1/admin", adminRoutes);

// campus route
app.use("/api/v1", campusRoutes);

// payment route
app.use("/api/payment", paymentGateway);

// mentor route
app.use("/api/v1/mentor", mentorRoutes);

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
