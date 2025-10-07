import mongoose from "mongoose";
import Court from "../models/Court.js";
import Record from "../models/Record.js";
import Counter from "../models/Counter.js";
import { sendEmail } from "../utils/sendMail.js";

/**
 * ==============================
 * HELPER: Get next auto-increment
 * ==============================
 */
async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

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

    if (!courtStation || !causeNo || !nameOfDeceased || !dateReceived || !leadTime) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const court = await Court.findById(courtStation).lean();
    if (!court) {
      return res.status(400).json({ success: false, message: "Invalid courtStation ID" });
    }

    const newNo = await getNextSequence("recordNo");

    const recordData = {
      no: newNo,
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      leadTime,
      form60Compliance,
      rejectionReason,
      statusAtGP,
      volumeNo,
      datePublished,
      dateForwardedToGP,
    };

    if (dateOfReceipt) recordData.dateOfReceipt = dateOfReceipt;

    const newRecord = await Record.create(recordData);

    // Send email asynchronously
    (async () => {
      try {
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

        await sendEmail({
          to: court.primaryEmail,
          cc: court.secondaryEmails,
          subject: form60Compliance === "Approved" ? "Document Approved" : "Document Rejected",
          message: text,
          html,
        });
      } catch (err) {
        console.error("Email sending failed:", err.message);
      }
    })();

    res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    console.error("Create record error:", error.message);
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
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid record ID" });

    const updatedRecord = await Record.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate("courtStation", "name level");

    if (!updatedRecord) return res.status(404).json({ success: false, message: "Record not found" });

    res.status(200).json({ success: true, message: "Record updated successfully", record: updatedRecord });
  } catch (error) {
    console.error("Update record error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update record", error: error.message });
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
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid record ID" });

    const deleted = await Record.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Record not found" });

    res.status(200).json({ success: true, message: "Record deleted successfully" });
  } catch (error) {
    console.error("Delete record error:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete record", error: error.message });
  }
};

/**
 * ==============================
 * GET RECORDS (User)
 * ==============================
 */
export const getRecords = async (req, res) => {
  try {
    const { page = 1, limit = 30, search = "" } = req.query;

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

    const totalRecords = await Record.countDocuments(query);

    res.json({
      success: true,
      records,
      currentPage: Number(page),
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords,
    });
  } catch (error) {
    console.error("Get records error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch records", error: error.message });
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
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid record ID" });

    const record = await Record.findById(id).populate("courtStation", "name level");
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error("Get record by ID error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch record", error: error.message });
  }
};

/**
 * ==============================
 * BULK UPDATE DATE FORWARDED
 * ==============================
 */
export const bulkUpdateDateForwarded = async (req, res) => {
  try {
    const { ids, date } = req.body;

    if (!ids || !Array.isArray(ids) || !date) {
      return res.status(400).json({
        success: false,
        message: "Missing ids or date",
      });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid IDs provided",
      });
    }

    // Update records
    const result = await Record.updateMany(
      { _id: { $in: validIds } },
      { dateForwardedToGP: date }
    );

    // Fetch updated records to get recipient details
    const updatedRecords = await Record.find({ _id: { $in: validIds } });

    if (!updatedRecords.length) {
      return res.status(404).json({
        success: false,
        message: "No records found for the provided IDs",
      });
    }

    // Build email recipient list
    const recipients = updatedRecords
      .map((r) => r.email)
      .filter(Boolean); // only valid emails

    // ✅ Send email if there are recipients
    if (recipients.length > 0) {
      await sendEmail({
        to: recipients[0], // first recipient or admin (you can adjust)
        cc: recipients.slice(1), // others in CC
        subject: "Record Forwarding Date Updated",
        html: `
          <h3>Bulk Date Update Notification</h3>
          <p>Dear User,</p>
          <p>The forwarding date for your record(s) has been updated to <strong>${date}</strong>.</p>
          <p>Total records updated: <strong>${result.modifiedCount}</strong></p>
          <p>Records affected:</p>
          <ul>
            ${updatedRecords
              .map(
                (r) => `<li>${r.caseNumber || r._id} — ${r.email || "N/A"}</li>`
              )
              .join("")}
          </ul>
          <br/>
          <p>Regards,<br/>Court Records System</p>
        `,
      });

      console.log("📧 Notification email sent to:", recipients.join(", "));
    } else {
      console.log("⚠️ No valid email addresses found for updated records");
    }

    res.status(200).json({
      success: true,
      message:
        "Records updated successfully. Notification email sent (if recipients found).",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk update error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update records or send email",
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
    // Total counts
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

    // Format weekly data
    const weeklyFormatted = weekly
      .map((w) => ({
        week: `W${w._id.week}-${w._id.year}`,
        total: w.total,
        approved: w.approved,
        rejected: w.rejected,
      }))
      .reverse();

    // Format monthly data
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
      rejected,
      weekly: weeklyFormatted,
      monthly: monthlyFormatted,
    });
  } catch (error) {
    console.error("getAdminDashboardStats error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard stats",
      error: error.message,
    });
  }
};

/**
 * ==============================
 * GET ALL RECORDS FOR ADMIN (Paginated + Filtered)
 * ==============================
 */
export const getAllRecordsForAdmin = async (req, res) => {
  try {
    let { page = 1, limit = 30, search = "", court = "All", status = "All" } = req.query;

    page = Math.max(Number(page), 1);
    limit = Math.max(Number(limit), 1);

    const query = {};

    // Status filter
    if (status !== "All") {
      query.form60Compliance = status;
    }

    // Court filter
    if (court !== "All" && mongoose.Types.ObjectId.isValid(court)) {
      query.courtStation = new mongoose.Types.ObjectId(court);
    }

    // Search filter
    if (search && search.trim() !== "") {
      const term = search.trim();

      // Find courts matching by name
      const matchedCourts = await Court.find(
        { name: { $regex: term, $options: "i" } },
        { _id: 1 }
      ).lean();

      const courtIds = matchedCourts.map((c) => c._id);

      query.$or = [
        { nameOfDeceased: { $regex: term, $options: "i" } },
        { causeNo: { $regex: term, $options: "i" } },
        ...(courtIds.length > 0 ? [{ courtStation: { $in: courtIds } }] : []),
      ];
    }

    const records = await Record.find(query)
      .populate("courtStation", "name level")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalRecords = await Record.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Records fetched successfully",
      totalRecords,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      pageSize: limit,
      records,
    });
  } catch (error) {
    console.error("getAllRecordsForAdmin error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch records for admin",
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
    console.error("getRecentRecords error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent records",
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
      message: "Records verified successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("verifyRecords error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to verify records",
      error: error.message,
    });
  }
};



/**
 * ==============================
 * JUDICIAL EMAIL TEMPLATE
 * ==============================
 */
function judicialEmailTemplate({ form60Compliance, nameOfDeceased, causeNo, courtName, reason, dateForwardedToGP }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px;">
      <div style="max-width:650px; margin:auto; background:#fff; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        <div style="display:flex; align-items:center; background:#006400; color:#fff; padding:15px;">
          <img src="https://judiciary.go.ke/wp-content/uploads/2023/05/logo1-Copy-2.png" 
               alt="Judiciary Logo" width="50" height="50" style="margin-right:15px;"/>
          <div>
            <h2 style="margin:0; font-size:20px;">Judiciary of Kenya</h2>
            <p style="margin:0; font-size:14px;">Principal Registry of the High Court</p>
          </div>
        </div>
        <div style="padding:20px; color:#000;">
          <h3 style="color:${form60Compliance === "Approved" ? "#006400" : "#b22222"};">Record ${form60Compliance}</h3>
          <p><b style="color:#006400;">Deceased:</b> ${nameOfDeceased}</p>
          <p><b style="color:#006400;">Cause No:</b> ${causeNo}</p>
          <p><b style="color:#006400;">Court:</b> ${courtName}</p>
          ${form60Compliance === "Rejected" ? `<p><b style="color:#b22222;">Reason:</b> ${reason}</p>` : ""}
          <p><b style="color:#006400;">Date Forwarded to GP:</b> ${dateForwardedToGP ? new Date(dateForwardedToGP).toLocaleDateString() : "N/A"}</p>
        </div>
        <div style="background:#f1f1f1; color:#555; padding:12px; text-align:center; font-size:12px;">
          ⚖️ This is a system-generated email from the ORHC of Kenya.<br/>
          Please do not reply directly to this message.
        </div>
      </div>
    </div>
  `;
}
