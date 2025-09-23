import { Router } from "express";
import { getCourts, createCourt, bulkCreateCourts } from "../controller/courtController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
const router = Router();

router.get("/all", isAuthenticated, isAuthorized("Admin"), getCourts);
router.post("/create", isAuthenticated, isAuthorized("Admin"), createCourt);
router.post("/bulk", isAuthenticated, isAuthorized("Admin"), bulkCreateCourts);

export default router;
