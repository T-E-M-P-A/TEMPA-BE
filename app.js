import express from "express";
import morgan from "morgan";
import cors from "cors";
import menteeRoutes from "./src/routes/menteeRoutes";
import adminRoutes from "./src/routes/adminRoutes";

const app = express();
const port = 8080;

// --- MIDDLEWARE ---
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/", (req, res) => {
  res.send("Hello EduMentor!");
});

// mentee route
app.use("/api/v1", menteeRoutes);

app.use("/api/v1", adminRoutes);

app.listen(port, () => {
  console.log(`Listening on port ${port}...`);
});
