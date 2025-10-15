import express from "express";
import { getGazetteDetails, getGazettes, getScanLogs, scanGazette } from "../controller/gazetteScannerController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.post(
  "/scan",
  upload.single("scan"),
  isAuthenticated,
  isAuthorized("Admin"),
  scanGazette
);

// View Scan Logs
router.get("/logs", isAuthenticated, isAuthorized("Admin"), getScanLogs);

// ✅ Fetch all gazettes (metadata only)
router.get("/get", isAuthenticated, isAuthorized("Admin"), getGazettes);

// Fetch Gazette 
router.get("/get/:id", isAuthenticated, isAuthorized("Admin"), getGazetteDetails)

export default router;
