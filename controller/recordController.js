import Court from "../models/Court.js";
import Record from "../models/Record.js";
import { sendEmail } from "../utils/sendMail.js";



/**
 * Create record
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

    // Check if causeNo already exists
    const existing = await Record.findOne({ causeNo });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `❌ Cause No "${causeNo}" already exists for ${existing.nameOfDeceased}`,
      });
    }

    // Validate courtStation
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

    // Prepare email
    const recipientEmails = [court.primaryEmail, ...(court.secondaryEmails || [])];
    const reasonText = rejectionReason?.trim() || "No reason provided";

    const text =
      form60Compliance === "Approved"
        ? `The record for ${nameOfDeceased} (Cause No. ${causeNo}) has been approved.`
        : `The record for ${nameOfDeceased} (Cause No. ${causeNo}) has been rejected. Reason: ${reasonText}`;

    // Judicial Styled Email Template
    const html = `
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
            <p><b style="color:#006400;">Court:</b> ${court.name}</p>
            ${
              form60Compliance === "Rejected"
                ? `<p><b style="color:#b22222;">Reason:</b> ${reasonText}</p>`
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

    try {
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

    res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Update record
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

    // Validate courtStation if provided
    let court;
    if (courtStation) {
      court = await Court.findById(courtStation);
      if (!court) return res.status(400).json({ message: "Invalid courtStation ID" });
    }

    // Recalculate lead time
    let leadTime;
    if (dateReceived && dateOfReceipt) {
      leadTime = Math.abs(
        Math.ceil((new Date(dateOfReceipt) - new Date(dateReceived)) / (1000 * 60 * 60 * 24))
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

    // Judicial Styled Email Template
    const html = `
      <div style="font-family: Arial, sans-serif; background:#f9f9f9; padding:20px;">
        <div style="max-width:650px; margin:auto; background:#fff; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
          
          <!-- Header -->
          <div style="display:flex; align-items:center; background:#006400; color:#fff; padding:15px;">
            <img src="https://judiciary.go.ke/wp-content/uploads/2023/05/logo1-Copy-2.png" 
                 alt="Judiciary Logo" width="50" height="50" style="margin-right:15px;"/>
            <div>
              <h2 style="margin:0; font-size:20px;">Judiciary of Kenya</h2>
              <p style="margin:0; font-size:14px;">Principal Registry High Court</p>
            </div>
          </div>

          <!-- Body -->
          <div style="padding:20px; color:#000;">
            <h3 style="color:${form60Compliance === "Approved" ? "#006400" : "#b22222"};">
              Record ${form60Compliance}
            </h3>

            <p><b style="color:#006400;">Deceased:</b> ${updatedRecord.nameOfDeceased}</p>
            <p><b style="color:#006400;">Cause No:</b> ${updatedRecord.causeNo}</p>
            <p><b style="color:#006400;">Court:</b> ${targetCourt.name}</p>
            ${
              form60Compliance === "Rejected"
                ? `<p><b style="color:#b22222;">Reason:</b> ${reasonText}</p>`
                : ""
            }
            <p><b style="color:#006400;">Date Forwarded to GP:</b> ${
              updatedRecord.dateForwardedToGP
                ? new Date(updatedRecord.dateForwardedToGP).toLocaleDateString()
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

    try {
      await sendEmail({
        to: targetCourt.primaryEmail,
        cc: targetCourt.secondaryEmails,
        subject: form60Compliance === "Approved" ? "Document Approved (Update)" : "Document Rejected (Update)",
        message: text,
        html,
      });
    } catch (err) {
      console.error("Email sending failed:", err.message);
    }

    res.status(200).json({ success: true, message: "Record updated successfully", data: updatedRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update record", error: error.message });
  }
};




/**
 * Get all records (with pagination + search)
 */
export const getRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    const query = search
      ? {
          $or: [
            { causeNo: { $regex: search, $options: "i" } },
            { nameOfDeceased: { $regex: search, $options: "i" } },
            // 👇 search by court name via populate
          ],
        }
      : {};

    const records = await Record.find(query)
      .populate("courtStation", "name level") // 👈 attach court info
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
 * Delete record
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
 * Get all records (Admin only)
 */
export const getAllRecordsForAdmin = async (req, res) => {
  try {
    const records = await Record.find()
      .populate("courtStation", "name level") // ✅ include court details
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
 * Get single record by ID
 */
export const getRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Record.findById(id).populate(
      "courtStation",
      "name level" // ✅ only return these fields
    );

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
 * Get record statistics
 */
/**
 * Get record statistics
 */
/**
 * Get record statistics
 */
/**
 * Get record statistics (optionally filtered by court)
 * @query courtId (optional) - if provided, stats will be limited to that court
 */
export const getRecordStats = async (req, res) => {
  try {
    const { courtId } = req.query;

    const matchStage = courtId ? { courtStation: courtId } : {};

    // Overall counts
    const totalRecords = await Record.countDocuments(matchStage);
    const approved = await Record.countDocuments({
      ...matchStage,
      form60Compliance: "Approved",
    });
    const rejected = await Record.countDocuments({
      ...matchStage,
      form60Compliance: "Rejected",
    });

    // Per court breakdown (only if no filter applied)
    let perCourt = [];
    if (!courtId) {
      perCourt = await Record.aggregate([
        { $group: {
            _id: "$courtStation",
            total: { $sum: 1 },
            approved: {
              $sum: { $cond: [{ $eq: ["$form60Compliance", "Approved"] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ["$form60Compliance", "Rejected"] }, 1, 0] },
            },
          }
        },
        {
          $lookup: {
            from: "courts",
            localField: "_id",
            foreignField: "_id",
            as: "court",
          },
        },
        { $unwind: { path: "$court", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            courtId: "$_id",
            courtName: "$court.name",
            courtLevel: "$court.level",
            total: 1,
            approved: 1,
            rejected: 1,
          },
        },
        { $sort: { total: -1 } },
      ]);
    }

    // Monthly trend (always applies, but filtered if courtId provided)
    const monthly = await Record.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          total: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $eq: ["$form60Compliance", "Approved"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$form60Compliance", "Rejected"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          total: 1,
          approved: 1,
          rejected: 1,
        },
      },
      { $sort: { year: 1, month: 1 } },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        overall: { totalRecords, approved, rejected },
        ...(courtId ? {} : { perCourt }), // only return perCourt if not filtering
        monthly,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "❌ Failed to fetch record stats",
      error: error.message,
    });
  }
};





/**
 * Verify (publish) records
 * Example: bulk verify by IDs
 */
export const verifyRecords = async (req, res) => {
  try {
    const { ids } = req.body; // expecting array of record IDs

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No record IDs provided for verification",
      });
    }

    // Update all given records
    const result = await Record.updateMany(
      { _id: { $in: ids } },
      { $set: { statusAtGP: "Published" } } // or another field you’re tracking
    );

    res.status(200).json({
      success: true,
      message: "✅ Records verified successfully",
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

