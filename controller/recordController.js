// controllers/recordController.js
import mongoose from "mongoose";
import Court from "../models/Court.js";
import Record from "../models/Record.js";
import { sendEmail } from "../utils/sendMail.js";

/**
 * ==============================
 * CREATE RECORD
 * ==============================
 */
export const createRecord = async (req, res) => {
  try {
    const {
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt,
      leadTime,
      form60Compliance = "Approved",
      rejectionReason = "",
      statusAtGP = "Pending",
      volumeNo = "",
      datePublished,
      dateForwardedToGP,
    } = req.body;

    // Validate court
    const court = await Court.findById(courtStation);
    if (!court) {
      return res.status(400).json({ message: "Invalid courtStation ID" });
    }

    // Auto-increment `no`
    const lastRecord = await Record.findOne().sort({ no: -1 });
    const newNo = lastRecord ? lastRecord.no + 1 : 1;

    // Create record
    const newRecord = await Record.create({
      no: newNo,
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt,
      leadTime,
      form60Compliance,
      rejectionReason,
      statusAtGP,
      volumeNo,
      datePublished,
      dateForwardedToGP,
    });

    // Email notification
    const reasonText = rejectionReason?.trim() || "No reason provided";
    const text =
      form60Compliance === "Approved"
        ? `The record for ${nameOfDeceased} (Cause No. ${causeNo}) has been approved.`
        : `The record for ${nameOfDeceased} (Cause No. ${causeNo}) has been rejected. Reason: ${reasonText}`;

    const html = judicialEmailTemplate({
      form60Compliance,
      nameOfDeceased,
      causeNo,
      courtName: court.name,
      reason: reasonText,
      dateForwardedToGP,
    });

    try {
      await sendEmail({
        to: court.primaryEmail,
        cc: court.secondaryEmails,
        subject:
          form60Compliance === "Approved" ? "Document Approved" : "Document Rejected",
        message: text,
        html,
      });
    } catch (err) {
      console.error("Email sending failed:", err.message);
    }

    res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


/**
 * ==============================
 * UPDATE RECORD
 * ==============================
 */
export const updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      courtStation,
      form60Compliance,
      rejectionReason,
      dateReceived,
      dateOfReceipt,
      statusAtGP,
      volumeNo,
      datePublished,
      dateForwardedToGP,
      ...rest
    } = req.body;

    // Validate courtStation if changed
    let court;
    if (courtStation) {
      court = await Court.findById(courtStation);
      if (!court) return res.status(400).json({ message: "Invalid courtStation ID" });
    }

    // Recalculate lead time
    let leadTime;
    if (dateReceived && dateOfReceipt) {
      leadTime = Math.abs(
        Math.ceil(
          (new Date(dateOfReceipt) - new Date(dateReceived)) / (1000 * 60 * 60 * 24)
        )
      );
    }

    // Update record
    const updatedRecord = await Record.findByIdAndUpdate(
      id,
      {
        ...rest,
        courtStation,
        form60Compliance,
        rejectionReason: form60Compliance === "Rejected" ? rejectionReason : "",
        dateReceived,
        dateOfReceipt,
        leadTime,
        statusAtGP,
        volumeNo,
        datePublished,
        dateForwardedToGP,
      },
      { new: true, runValidators: true }
    ).populate("courtStation", "name level primaryEmail secondaryEmails");

    if (!updatedRecord) return res.status(404).json({ message: "Record not found" });

    // Send email notification
    const targetCourt = court || updatedRecord.courtStation;
    const reasonText = rejectionReason?.trim() || "No reason provided";

    const text =
      form60Compliance === "Approved"
        ? `The record for ${updatedRecord.nameOfDeceased} (Cause No. ${updatedRecord.causeNo}) has been approved.`
        : `The record for ${updatedRecord.nameOfDeceased} (Cause No. ${updatedRecord.causeNo}) has been rejected. Reason: ${reasonText}`;

    const html = judicialEmailTemplate({
      form60Compliance,
      nameOfDeceased: updatedRecord.nameOfDeceased,
      causeNo: updatedRecord.causeNo,
      courtName: targetCourt.name,
      reason: reasonText,
      dateForwardedToGP: updatedRecord.dateForwardedToGP,
    });

    try {
      await sendEmail({
        to: targetCourt.primaryEmail,
        cc: targetCourt.secondaryEmails,
        subject:
          form60Compliance === "Approved"
            ? "Document Approved (Update)"
            : "Document Rejected (Update)",
        message: text,
        html,
      });
    } catch (err) {
      console.error("Email sending failed:", err.message);
    }

    res.status(200).json({
      success: true,
      message: "Record updated successfully",
      data: updatedRecord,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update record",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET RECORDS (Paginated + Search)
 * ==============================
 */
export const getRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    const query = search
      ? {
          $or: [
            { causeNo: { $regex: search, $options: "i" } },
            { nameOfDeceased: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const records = await Record.find(query)
      .populate("courtStation", "name level")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Record.countDocuments(query);

    res.json({
      success: true,
      records,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch records",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * DELETE RECORD
 * ==============================
 */
export const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Record.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "❌ Record not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "🗑️ Record deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to delete record",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET ALL RECORDS (Admin Only)
 * ==============================
 */
export const getAllRecordsForAdmin = async (req, res) => {
  try {
    const records = await Record.find()
      .populate("courtStation", "name level")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalRecords: records.length,
      records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch all records",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET RECORD BY ID
 * ==============================
 */
export const getRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Record.findById(id).populate("courtStation", "name level");

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "❌ Record not found",
      });
    }

    res.status(200).json({
      success: true,
      record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch record",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET ADMIN DASHBOARD STATS
 * ==============================
 */
export const getAdminDashboardStats = async (req, res) => {
  try {
    const totalRecords = await Record.countDocuments();
    const approved = await Record.countDocuments({ form60Compliance: "Approved" });
    const rejected = await Record.countDocuments({ form60Compliance: "Rejected" });

    // Weekly stats (last 6 weeks)
    const weekly = await Record.aggregate([
      {
        $group: {
          _id: {
            week: { $isoWeek: "$dateReceived" },
            year: { $year: "$dateReceived" },
          },
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$form60Compliance", "Approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$form60Compliance", "Rejected"] }, 1, 0] } },
        },
      },
      { $sort: { "_id.year": -1, "_id.week": -1 } },
      { $limit: 6 },
    ]);

    // Monthly stats (last 6 months)
    const monthly = await Record.aggregate([
      {
        $group: {
          _id: {
            month: { $month: "$dateReceived" },
            year: { $year: "$dateReceived" },
          },
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$form60Compliance", "Approved"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$form60Compliance", "Rejected"] }, 1, 0] } },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]);

    const weeklyFormatted = weekly
      .map((w) => ({
        week: `W${w._id.week}-${w._id.year}`,
        total: w.total,
        approved: w.approved,
        rejected: w.rejected,
      }))
      .reverse();

    const monthlyFormatted = monthly
      .map((m) => ({
        month: `${m._id.month}/${m._id.year}`,
        total: m.total,
        approved: m.approved,
        rejected: m.rejected,
      }))
      .reverse();

    res.status(200).json({
      success: true,
      totalRecords,
      approved,
      pending: rejected,
      weekly: weeklyFormatted,
      monthly: monthlyFormatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch admin dashboard stats",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET RECENT RECORDS
 * ==============================
 */
export const getRecentRecords = async (req, res) => {
  try {
    const recentRecords = await Record.find()
      .populate("courtStation", "name")
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      recentRecords,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch recent records",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * VERIFY (Publish) RECORDS
 * ==============================
 */
export const verifyRecords = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No record IDs provided for verification",
      });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid record IDs",
      });
    }

    const result = await Record.updateMany(
      { _id: { $in: validIds } },
      { $set: { statusAtGP: "Published", datePublished: new Date() } }
    );

    res.status(200).json({
      success: true,
      message: "✅ Records verified successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to verify records",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * HELPER: Judicial Email Template
 * ==============================
 */
function judicialEmailTemplate({
  form60Compliance,
  nameOfDeceased,
  causeNo,
  courtName,
  reason,
  dateForwardedToGP,
}) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px;">
      <div style="max-width:650px; margin:auto; background:#fff; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; background:#006400; color:#fff; padding:15px;">
          <img src="https://judiciary.go.ke/wp-content/uploads/2023/05/logo1-Copy-2.png" 
               alt="Judiciary Logo" width="50" height="50" style="margin-right:15px;"/>
          <div>
            <h2 style="margin:0; font-size:20px;">Judiciary of Kenya</h2>
            <p style="margin:0; font-size:14px;">Principal Registry of the High Court</p>
          </div>
        </div>

        <!-- Body -->
        <div style="padding:20px; color:#000;">
          <h3 style="color:${form60Compliance === "Approved" ? "#006400" : "#b22222"};">
            Record ${form60Compliance}
          </h3>

          <p><b style="color:#006400;">Deceased:</b> ${nameOfDeceased}</p>
          <p><b style="color:#006400;">Cause No:</b> ${causeNo}</p>
          <p><b style="color:#006400;">Court:</b> ${courtName}</p>
          ${
            form60Compliance === "Rejected"
              ? `<p><b style="color:#b22222;">Reason:</b> ${reason}</p>`
              : ""
          }
          <p><b style="color:#006400;">Date Forwarded to GP:</b> ${
            dateForwardedToGP
              ? new Date(dateForwardedToGP).toLocaleDateString()
              : "N/A"
          }</p>
        </div>

        <!-- Footer -->
        <div style="background:#f1f1f1; color:#555; padding:12px; text-align:center; font-size:12px;">
          ⚖️ This is a system-generated email from the ORHC of Kenya.<br/>
          Please do not reply directly to this message.
        </div>

      </div>
    </div>
  `;
}
