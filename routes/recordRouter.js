import express from "express";
import {
  createRecord,
  getRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
  getAllRecordsForAdmin,
  getAdminDashboardStats,
  getRecentRecords,
  verifyRecords,
  bulkUpdateDateForwarded,
  downloadMonthlyReport,
} from "../controller/recordController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";

const router = express.Router();

// ========== CRUD Routes ==========

// Create a record (Admin only)
router.post("/create", isAuthenticated, isAuthorized("Admin"), createRecord);

// Get all records (User)
router.get("/user-records", getRecords);

// Get single record by ID (User)
router.get("/get/:id", getRecordById);

// Update record (Admin only)
router.put("/update/:id", isAuthenticated, isAuthorized("Admin"), updateRecord);

// Delete record (Admin only)
router.delete("/delete/:id", isAuthenticated, isAuthorized("Admin"), deleteRecord);

// Admin-only: Get all records
router.get("/admin", isAuthenticated, isAuthorized("Admin"), getAllRecordsForAdmin);

// Admin-only: Dashboard stats
router.get("/dashboard-stats", isAuthenticated, isAuthorized("Admin"), getAdminDashboardStats);

// Admin-only: Recent records
router.get("/recent", isAuthenticated, isAuthorized("Admin"), getRecentRecords);

// Admin-only: Verify / Publish records
router.post("/verify", isAuthenticated, isAuthorized("Admin"), verifyRecords);

// Admin-only: Bulk update dateForwarded
router.patch("/bulk-update-forwarded", isAuthenticated, isAuthorized("Admin"), bulkUpdateDateForwarded);

router.get("/monthly-report", isAuthenticated, isAuthorized("Admin"), downloadMonthlyReport);



export default router;
