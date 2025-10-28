import express from "express";
import {
  scanGazette,
  getGazettes,
  getGazetteDetails,
  getScanLogs
} from "../controller/gazetteScannerController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// 🧾 Scan Gazette
router.post("/scan", upload.single("scan"), isAuthenticated, isAuthorized("Admin"), scanGazette);

// 📚 Fetch all gazettes
router.get("/get", isAuthenticated, isAuthorized("Admin"), getGazettes);

// 📑 Fetch Gazette details
router.get("/get/:id", isAuthenticated, isAuthorized("Admin"), getGazetteDetails);

// 🧠 Fetch Scan Logs
router.get("/logs", isAuthenticated, isAuthorized("Admin"), getScanLogs);

export default router;
