import mongoose from "mongoose";
import Court from "../models/Court.js";
import Record from "../models/Record.js";
import Counter from "../models/Counter.js";
import { sendEmail } from "../utils/sendMail.js";
import { User } from "../models/userModel.js";
import { Parser } from "json2csv";

/* =========================================================
 * 🧩 HELPER — AUTO-INCREMENT RECORD NUMBERS
 * ========================================================= */
async function getNextSequence(name) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter?.seq ?? 1;
}

/* =========================================================
 * 📝 EMAIL TEMPLATES
 * ========================================================= */
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
        <div style="display:flex; align-items:center; background:#006400; color:#fff; padding:15px;">
          <img src="https://judiciary.go.ke/wp-content/uploads/2023/05/logo1-Copy-2.png" 
               alt="Judiciary Logo" width="50" height="50" style="margin-right:15px;"/>
          <div>
            <h2 style="margin:0; font-size:20px;">Judiciary of Kenya</h2>
            <p style="margin:0; font-size:14px;">Principal Registry of the High Court</p>
          </div>
        </div>
        <div style="padding:20px; color:#000;">
          <h3 style="color:${
            form60Compliance === "Approved" ? "#006400" : "#b22222"
          };">Record ${form60Compliance}</h3>
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
        <div style="background:#f1f1f1; color:#555; padding:12px; text-align:center; font-size:12px;">
          ⚖️ This is a system-generated email from the ORHC of Kenya.<br/>
          Please do not reply directly to this message.
        </div>
      </div>
    </div>
  `;
}

function bulkForwardingEmailTemplate(updatedRecords, date) {
  const recordsTable = `
    <table style="width:100%; border-collapse:collapse; margin-top:16px;">
      <thead>
        <tr style="background-color:#e8f0fe; color:#003366;">
          <th style="border:1px solid #ccc; padding:8px;">Cause No</th>
          <th style="border:1px solid #ccc; padding:8px;">Court</th>
          <th style="border:1px solid #ccc; padding:8px;">Date Forwarded</th>
        </tr>
      </thead>
      <tbody>
        ${updatedRecords.map(r => `
          <tr>
            <td style="border:1px solid #ccc; padding:8px;">${r.causeNo}</td>
            <td style="border:1px solid #ccc; padding:8px;">${r.courtStation?.name || "—"}</td>
            <td style="border:1px solid #ccc; padding:8px;">${date}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  return `
    <div style="font-family:Arial,sans-serif; border:1px solid #ddd; border-radius:8px;">
      <div style="background:#003366; color:#fff; text-align:center; padding:20px;">
        <h2>Principal Registry - Court Records System</h2>
      </div>
      <div style="padding:20px;">
        <p>Dear Team,</p>
        <p><strong>${updatedRecords.length}</strong> record(s) have been forwarded to G.P on <strong>${date}</strong>.</p>
        ${recordsTable}
        <p style="margin-top:20px;">Regards,<br><strong>Principal Registry System</strong></p>
      </div>
      <div style="background:#f4f4f4; text-align:center; font-size:12px; color:#777; padding:12px;">
        © ${new Date().getFullYear()} Principal Registry. All rights reserved.
      </div>
    </div>
  `;
}

/* =========================================================
 * 🆕 CREATE RECORD
 * ========================================================= */
export const createRecord = async (req, res) => {
  try {
    const {
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt,
      dateForwardedToGP,
      email,
    } = req.body;

    const recordNo = await getNextSequence("record");

    const newRecord = new Record({
      no: recordNo,
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt,
      dateForwardedToGP,
      email,
    });

    const saved = await newRecord.save();

    // Send notification email to Admin + Court
    const admins = await User.find({ role: "Admin", accountVerified: true }).select("email name");
    const adminEmails = admins.length ? admins.map(a => a.email) : ["principalregistry@gmail.com"];
    const courtObj = await Court.findById(courtStation).select("name primaryEmail secondaryEmails");

    const html = judicialEmailTemplate({
      form60Compliance: saved.form60Compliance,
      nameOfDeceased,
      causeNo,
      courtName: courtObj?.name || "N/A",
      reason: saved.rejectionReason,
      dateForwardedToGP,
    });

    if (adminEmails.length) {
      await sendEmail({ to: adminEmails[0], cc: adminEmails.slice(1), subject: "New Record Created", html });
    }

    if (courtObj?.primaryEmail) {
      await sendEmail({ to: courtObj.primaryEmail, cc: courtObj.secondaryEmails || [], subject: "New Record Created", html });
    }

    res.status(201).json(saved);
  } catch (error) {
    console.error("createRecord error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

/* =========================================================
 * 📝 UPDATE RECORD
 * ========================================================= */
export const updateRecord = async (req, res) => {
  try {
    const updated = await Record.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("courtStation", "name primaryEmail secondaryEmails");

    if (!updated) return res.status(404).json({ message: "Record not found" });

    // Send email if form60Compliance changed
    if (req.body.form60Compliance) {
      const admins = await User.find({ role: "Admin", accountVerified: true }).select("email name");
      const adminEmails = admins.length ? admins.map(a => a.email) : ["principalregistry@gmail.com"];

      const html = judicialEmailTemplate({
        form60Compliance: updated.form60Compliance,
        nameOfDeceased: updated.nameOfDeceased,
        causeNo: updated.causeNo,
        courtName: updated.courtStation?.name || "N/A",
        reason: updated.rejectionReason,
        dateForwardedToGP: updated.dateForwardedToGP,
      });

      if (adminEmails.length) await sendEmail({ to: adminEmails[0], cc: adminEmails.slice(1), subject: "Record Form 60 Updated", html });
      if (updated.courtStation?.primaryEmail) await sendEmail({ to: updated.courtStation.primaryEmail, cc: updated.courtStation.secondaryEmails || [], subject: "Record Form 60 Updated", html });
    }

    res.json(updated);
  } catch (error) {
    console.error("updateRecord error:", error.message);
    res.status(400).json({ message: error.message });
  }
};

/* =========================================================
 * 🗑️ DELETE RECORD
 * ========================================================= */
export const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid record ID" });

    const deleted = await Record.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Record not found" });

    res.status(200).json({ success: true, message: "Record deleted successfully" });
  } catch (error) {
    console.error("deleteRecord error:", error.message);
    res.status(500).json({ success: false, message: "Failed to delete record", error: error.message });
  }
};

/* =========================================================
 * 📋 BULK UPDATE DATE FORWARDED
 * ========================================================= */
export const bulkUpdateDateForwarded = async (req, res) => {
  try {
    const { ids, date } = req.body;
    if (!ids || !Array.isArray(ids) || !date) return res.status(400).json({ success: false, message: "Missing ids or date" });

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length) return res.status(400).json({ success: false, message: "No valid IDs provided" });

    const result = await Record.updateMany({ _id: { $in: validIds } }, { dateForwardedToGP: date });
    const updatedRecords = await Record.find({ _id: { $in: validIds } }).populate("courtStation", "name primaryEmail secondaryEmails");

    if (!updatedRecords.length) return res.status(404).json({ success: false, message: "No matching records found" });

    // Admins
    let admins = await User.find({ role: "Admin", accountVerified: true }).select("email name");
    if (!admins.length) admins = [{ email: "principalregistry@gmail.com", name: "System Admin" }];
    const adminEmails = admins.map(a => a.email);

    const html = bulkForwardingEmailTemplate(updatedRecords, date);

    // Notify Admins
    await sendEmail({ to: adminEmails[0], cc: adminEmails.slice(1), subject: "Bulk Record Forwarding Update", html });

    // Notify Courts
    for (const court of [...new Set(updatedRecords.map(r => r.courtStation))]) {
      if (court?.primaryEmail) {
        await sendEmail({ to: court.primaryEmail, cc: court.secondaryEmails || [], subject: "Record Forwarded to GP", html });
      }
    }

    res.status(200).json({ success: true, message: "Records updated successfully. Admins and courts notified.", modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("bulkUpdateDateForwarded error:", error.message);
    res.status(500).json({ success: false, message: "Failed to update records or send emails", error: error.message });
  }
};

/* =========================================================
 * 🔎 GET RECORDS FOR ADMIN (Paginated + Filters)
 * ========================================================= */
export const getAllRecordsForAdmin = async (req, res) => {
  try {
    let { page = 1, limit = 30, search = "", court = "All", status = "All" } = req.query;
    page = Math.max(Number(page), 1);
    limit = Math.max(Number(limit), 1);

    const query = {};
    if (status !== "All") query.form60Compliance = status;
    if (court !== "All" && mongoose.Types.ObjectId.isValid(court)) query.courtStation = new mongoose.Types.ObjectId(court);
    if (search?.trim()) {
      const term = search.trim();
      const matchedCourts = await Court.find({ name: { $regex: term, $options: "i" } }, { _id: 1 }).lean();
      const courtIds = matchedCourts.map(c => c._id);
      query.$or = [
        { nameOfDeceased: { $regex: term, $options: "i" } },
        { causeNo: { $regex: term, $options: "i" } },
        ...(courtIds.length ? [{ courtStation: { $in: courtIds } }] : []),
      ];
    }

    const records = await Record.find(query).populate("courtStation", "name level").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
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
    res.status(500).json({ success: false, message: "Failed to fetch records for admin", error: error.message });
  }
};


/* =========================================================
 * 📥 DOWNLOAD MONTHLY REPORT (CSV)
 * ========================================================= */
export const downloadMonthlyReport = async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const records = await Record.find({
      $expr: {
        $and: [
          { $eq: [{ $month: "$dateReceived" }, month] },
          { $eq: [{ $year: "$dateReceived" }, year] },
        ],
      },
    })
      .populate("courtStation", "name")
      .lean();

    if (!records.length) {
      return res.status(404).json({ message: "No records for this month" });
    }

    const fields = [
      "no",
      "causeNo",
      "nameOfDeceased",
      "courtStation.name",
      "form60Compliance",
      "dateReceived",
      "dateForwardedToGP",
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(records);

    res.header("Content-Type", "text/csv");
    res.attachment(`Monthly_Report_${month}-${year}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error("downloadMonthlyReport error:", error.message);
    res.status(500).json({ message: "Failed to generate monthly report", error: error.message });
  }
};


/* =========================================================
 * 📊 ADMIN DASHBOARD STATS
 * ========================================================= */
export const getAdminDashboardStats = async (req, res) => {
  try {
    const totalRecords = await Record.countDocuments();
    const approved = await Record.countDocuments({ form60Compliance: "Approved" });
    const rejected = await Record.countDocuments({ form60Compliance: "Rejected" });

    /* ---------------- Weekly stats (last 6 weeks) ---------------- */
    const weekly = await Record.aggregate([
      {
        $group: {
          _id: {
            week: { $isoWeek: "$dateReceived" },
            year: { $year: "$dateReceived" },
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
      { $sort: { "_id.year": -1, "_id.week": -1 } },
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

    /* ---------------- Monthly stats (last 6 months) ---------------- */
    const monthly = await Record.aggregate([
      {
        $group: {
          _id: {
            month: { $month: "$dateReceived" },
            year: { $year: "$dateReceived" },
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
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]);

    const monthlyFormatted = monthly
      .map((m) => ({
        month: `${m._id.month}-${m._id.year}`,
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


export const getRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid record ID" });

    const record = await Record.findById(id).populate("courtStation", "name level");
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });

    res.status(200).json({ success: true, record });
  } catch (error) {
    console.error("Get record by ID error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch record",
      error: error.message,
    });
  }
};


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
    res.status(500).json({
      success: false,
      message: "Failed to fetch records",
      error: error.message,
    });
  }
};

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

