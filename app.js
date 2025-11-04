import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./helpers/db.js";
import { errorMiddleware } from "./middlewares/errorMiddlewares.js";
import authRouter from "./routes/authRouter.js";
import recordRouter from "./routes/recordRouter.js";
import courtRouter from "./routes/courtRouter.js";
import userRouter from "./routes/userRouter.js";
import gazetteRouter from "./routes/gazetteRouter.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: "./config/.env" });
export const app = express();

// CORS
app.use(cors({
  origin: ["https://urithi.vercel.app", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Debug log
app.use((req, _res, next) => {
  console.log("📥 Incoming request:", req.originalUrl);
  console.log("📦 Body:", req.body);
  next();
});

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/records", recordRouter);
app.use("/api/v1/courts", courtRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/gazette", gazetteRouter);

// DB connection
connectDB();

// Global error handler
app.use(errorMiddleware);
