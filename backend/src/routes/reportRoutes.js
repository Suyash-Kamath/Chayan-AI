const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authMiddleware = require("../middlewares/auth");
const reportController = require("../controllers/reportController");

const router = express.Router();

router.get("/mis-summary", authMiddleware, asyncHandler(reportController.misSummary));
router.get("/daily-reports", authMiddleware, asyncHandler(reportController.dailyReports));
router.get("/previous-day-reports", authMiddleware, asyncHandler(reportController.previousDayReports));
router.get("/reports/:date_type", authMiddleware, asyncHandler(reportController.getReportsByDate));

module.exports = router;
