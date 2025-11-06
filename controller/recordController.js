// server/controller/recordController.js
import mongoose from "mongoose";
import Court from "../models/Court.js";
import Record from "../models/Record.js";
import Counter from "../models/Counter.js";
import { sendEmail } from "../utils/sendMail.js";
import { User } from "../models/userModel.js";
import { Parser } from "json2csv";

/* =========================================================
 * 🧩 HELPER — SAFE, FAST COUNTER (uses _id in Counter schema)
 * ========================================================= */
async function getNextSequence(counterId) {
  if (!counterId) throw new Error("Counter id is required");

  // Using findOneAndUpdate on _id to support your Counter schema (_id: String)
  const updated = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  // If we somehow still get null, return 1
  return (updated && updated.seq) || 1;
}

/* =========================================================
 * ✅ Small helpers for email templates (kept compact)
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
          <img src="https://judiciary.go.ke/wp-content/uploads/2023/05/logo1-Copy-2.png" alt="Judiciary Logo" width="50" height="50" style="margin-right:15px;"/>
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
          ⚖️ This is a system-generated email from the ORHC of Kenya.<br/>Please do not reply directly to this message.
        </div>
      </div>
    </div>
  `;
}

function bulkForwardingEmailTemplate(updatedRecords, date) {
  const rows = updatedRecords
    .map(
      (r) => `
    <tr>
      <td style="border:1px solid #ccc; padding:8px;">${r.causeNo}</td>
      <td style="border:1px solid #ccc; padding:8px;">${
        r.courtStation?.name || "—"
      }</td>
      <td style="border:1px solid #ccc; padding:8px;">${date}</td>
    </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif; border:1px solid #ddd; border-radius:8px;">
      <div style="background:#003366; color:#fff; text-align:center; padding:20px;"><h2>Principal Registry - Court Records System</h2></div>
      <div style="padding:20px;">
        <p>Dear Team,</p>
        <p><strong>${
          updatedRecords.length
        }</strong> record(s) have been forwarded to G.P on <strong>${date}</strong>.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:16px;">
          <thead>
            <tr style="background-color:#e8f0fe; color:#003366;">
              <th style="border:1px solid #ccc; padding:8px;">Cause No</th>
              <th style="border:1px solid #ccc; padding:8px;">Court</th>
              <th style="border:1px solid #ccc; padding:8px;">Date Forwarded</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:20px;">Regards,<br><strong>Principal Registry System</strong></p>
      </div>
      <div style="background:#f4f4f4; text-align:center; font-size:12px; color:#777; padding:12px;">© ${new Date().getFullYear()} Principal Registry. All rights reserved.</div>
    </div>
  `;
}

/* =========================================================
 * 🆕 CREATE RECORD - optimized
 * - uses counter increment first (single DB op)
 * - validates input minimally
 * - sends emails in parallel
 * ========================================================= */
export const createRecord = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt,
      dateForwardedToGP,
      email,
      form60Compliance = "Approved",
      rejectionReason = "",
    } = req.body || {};

    // Minimal validation
    if (!courtStation || !causeNo || !nameOfDeceased || !dateReceived) {
      return res
        .status(400)
        .json({
          message:
            "Missing required fields: courtStation, causeNo, nameOfDeceased, dateReceived",
        });
    }

    // Start a session/transaction if available (best-effort)
    let recordToSave;
    if (
      mongoose.connection.client.topology &&
      mongoose.connection.client.topology.isConnected()
    ) {
      session.startTransaction();
    }

    // 1) get a unique incremental number for the record (atomic on Counter)
    // use _id in Counter schema (e.g. "record")
    const nextNo = await getNextSequence("record").catch((err) => {
      throw new Error(`Failed to get next sequence: ${err.message}`);
    });

    // 2) Build and save record (single save)
    const recordPayload = {
      no: nextNo,
      courtStation,
      causeNo,
      nameOfDeceased,
      dateReceived,
      dateOfReceipt: dateOfReceipt || null,
      dateForwardedToGP: dateForwardedToGP || null,
      email: email || null,
      form60Compliance,
      rejectionReason: rejectionReason || "",
    };

    recordToSave = await Record.create([recordPayload], { session }).then(
      (arr) => arr[0]
    );

    // commit transaction if used
    if (session.inTransaction()) await session.commitTransaction();

    // populate courtStation for emails (lean)
    const courtObj = await Court.findById(courtStation)
      .select("name primaryEmail secondaryEmails")
      .lean();

    // find admin emails (lean)
    const admins = await User.find({ role: "Admin", accountVerified: true })
      .select("email name")
      .lean();
    const adminEmails = admins.length
      ? admins.map((a) => a.email)
      : ["principalregistry@gmail.com"];

    const html = judicialEmailTemplate({
      form60Compliance: recordToSave.form60Compliance,
      nameOfDeceased,
      causeNo,
      courtName: courtObj?.name || "N/A",
      reason: recordToSave.rejectionReason,
      dateForwardedToGP: recordToSave.dateForwardedToGP,
    });

    // send emails in parallel (don’t await inside loop)
    const sendPromises = [];
    if (adminEmails.length) {
      sendPromises.push(
        sendEmail({
          to: adminEmails[0],
          cc: adminEmails.slice(1),
          subject: "New Record Created",
          html,
        })
      );
    }
    if (courtObj?.primaryEmail) {
      sendPromises.push(
        sendEmail({
          to: courtObj.primaryEmail,
          cc: courtObj.secondaryEmails || [],
          subject: "New Record Created",
          html,
        })
      );
    }

    // best-effort email send - don't block response if email fails, but log errors
    Promise.allSettled(sendPromises).then((results) => {
      results.forEach((r) => {
        if (r.status === "rejected") {
          console.error("Email send error:", r.reason);
        }
      });
    });

    return res.status(201).json(recordToSave);
  } catch (err) {
    // ensure transaction abort if session active
    try {
      if (session.inTransaction()) await session.abortTransaction();
    } catch (abortErr) {
      console.error("Error aborting transaction:", abortErr);
    }
    console.error("createRecord error:", err.message || err);
    return res
      .status(500)
      .json({ message: err.message || "Failed to create record" });
  } finally {
    session.endSession();
  }
};

/* =========================================================
 * 📝 UPDATE RECORD - optimized
 * - runs single DB op to update and return populated document
 * - sends notifications only when relevant
 * ========================================================= */
export const updateRecord = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid record ID" });

    // Using findByIdAndUpdate with runValidators ensures updated computed lead times are applied via schema hooks
    const updated = await Record.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("courtStation", "name primaryEmail secondaryEmails")
      .lean();

    if (!updated) return res.status(404).json({ message: "Record not found" });

    // If form60Compliance changed in payload, send notifications
    if (req.body.form60Compliance) {
      const admins = await User.find({ role: "Admin", accountVerified: true })
        .select("email name")
        .lean();
      const adminEmails = admins.length
        ? admins.map((a) => a.email)
        : ["principalregistry@gmail.com"];

      const html = judicialEmailTemplate({
        form60Compliance: updated.form60Compliance,
        nameOfDeceased: updated.nameOfDeceased,
        causeNo: updated.causeNo,
        courtName: updated.courtStation?.name || "N/A",
        reason: updated.rejectionReason,
        dateForwardedToGP: updated.dateForwardedToGP,
      });

      const promises = [];
      if (adminEmails.length)
        promises.push(
          sendEmail({
            to: adminEmails[0],
            cc: adminEmails.slice(1),
            subject: "Record Form 60 Updated",
            html,
          })
        );
      if (updated.courtStation?.primaryEmail)
        promises.push(
          sendEmail({
            to: updated.courtStation.primaryEmail,
            cc: updated.courtStation.secondaryEmails || [],
            subject: "Record Form 60 Updated",
            html,
          })
        );

      // best-effort
      Promise.allSettled(promises).then((results) =>
        results.forEach(
          (r) =>
            r.status === "rejected" && console.error("Email error:", r.reason)
        )
      );
    }

    return res.json(updated);
  } catch (err) {
    console.error("updateRecord error:", err.message || err);
    return res
      .status(500)
      .json({ message: err.message || "Failed to update record" });
  }
};

/* =========================================================
 * 🗑️ DELETE RECORD - optimized
 * ========================================================= */
export const deleteRecord = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid record ID" });

    const deleted = await Record.findByIdAndDelete(id).lean();
    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    return res
      .status(200)
      .json({ success: true, message: "Record deleted successfully" });
  } catch (err) {
    console.error("deleteRecord error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete record",
        error: err.message,
      });
  }
};

/* =========================================================
 * 📋 BULK UPDATE DATE FORWARDED - optimized
 * - one updateMany call
 * - fetch updated documents once (lean)
 * - batch emails by court
 * ========================================================= */
export const bulkUpdateDateForwarded = async (req, res) => {
  try {
    const { ids, date } = req.body || {};
    if (!ids || !Array.isArray(ids) || !date)
      return res
        .status(400)
        .json({ success: false, message: "Missing ids or date" });

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "No valid IDs provided" });

    // 1) updateMany
    const result = await Record.updateMany(
      { _id: { $in: validIds } },
      { $set: { dateForwardedToGP: date } }
    );
    if (!result.matchedCount)
      return res
        .status(404)
        .json({ success: false, message: "No matching records found" });

    // 2) fetch updated records once and populate courtStation
    const updatedRecords = await Record.find({ _id: { $in: validIds } })
      .populate("courtStation", "name primaryEmail secondaryEmails")
      .lean();

    // 3) email admins once + group court notifications to avoid duplicates
    let admins = await User.find({ role: "Admin", accountVerified: true })
      .select("email name")
      .lean();
    if (!admins.length)
      admins = [{ email: "principalregistry@gmail.com", name: "System Admin" }];
    const adminEmails = admins.map((a) => a.email);

    const html = bulkForwardingEmailTemplate(updatedRecords, date);

    // send admin email
    const emailPromises = [];
    emailPromises.push(
      sendEmail({
        to: adminEmails[0],
        cc: adminEmails.slice(1),
        subject: "Bulk Record Forwarding Update",
        html,
      })
    );

    // group updatedRecords by court (by id) to send one email per court
    const courtsMap = new Map();
    updatedRecords.forEach((r) => {
      const c = r.courtStation;
      if (!c) return;
      const key = c._id.toString();
      if (!courtsMap.has(key)) courtsMap.set(key, { court: c, records: [] });
      courtsMap.get(key).records.push(r);
    });

    for (const { court, records } of courtsMap.values()) {
      if (court.primaryEmail) {
        const courtHtml = bulkForwardingEmailTemplate(records, date);
        emailPromises.push(
          sendEmail({
            to: court.primaryEmail,
            cc: court.secondaryEmails || [],
            subject: "Record(s) Forwarded to GP",
            html: courtHtml,
          })
        );
      }
    }

    // run best-effort
    Promise.allSettled(emailPromises).then((results) =>
      results.forEach(
        (r) =>
          r.status === "rejected" && console.error("Email error:", r.reason)
      )
    );

    return res
      .status(200)
      .json({
        success: true,
        message: "Records updated successfully. Admins and courts notified.",
        modifiedCount: result.modifiedCount,
      });
  } catch (err) {
    console.error("bulkUpdateDateForwarded error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update records or send emails",
        error: err.message,
      });
  }
};

/* =========================================================
 * 🔎 GET RECORDS FOR ADMIN (Paginated + Filters) - optimized
 * - builds query efficiently
 * - performs countDocuments and find in parallel
 * ========================================================= */
export const getAllRecordsForAdmin = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 30,
      search = "",
      court = "All",
      status = "All",
    } = req.query;
    page = Math.max(Number(page), 1);
    limit = Math.max(Number(limit), 1);

    const query = {};
    if (status !== "All") query.form60Compliance = status;
    if (court !== "All" && mongoose.Types.ObjectId.isValid(court))
      query.courtStation = new mongoose.Types.ObjectId(court);

    // if searching, build OR with regex; also try to match courts names to reduce scans
    if (search?.trim()) {
      const term = search.trim();
      const courtIds = (
        await Court.find(
          { name: { $regex: term, $options: "i" } },
          { _id: 1 }
        ).lean()
      ).map((c) => c._id);
      query.$or = [
        { nameOfDeceased: { $regex: term, $options: "i" } },
        { causeNo: { $regex: term, $options: "i" } },
        ...(courtIds.length ? [{ courtStation: { $in: courtIds } }] : []),
      ];
    }

    // execute count and data fetch in parallel
    const [totalRecords, records] = await Promise.all([
      Record.countDocuments(query),
      Record.find(query)
        .populate("courtStation", "name level")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Records fetched successfully",
      totalRecords,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      pageSize: limit,
      records,
    });
  } catch (err) {
    console.error("getAllRecordsForAdmin error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch records for admin",
        error: err.message,
      });
  }
};

/* =========================================================
 * 📥 DOWNLOAD MONTHLY REPORT (CSV) - optimized
 * ========================================================= */
export const downloadMonthlyReport = async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

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

    if (!records.length)
      return res.status(404).json({ message: "No records for this month" });

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
  } catch (err) {
    console.error("downloadMonthlyReport error:", err.message || err);
    return res
      .status(500)
      .json({
        message: "Failed to generate monthly report",
        error: err.message,
      });
  }
};

/* =========================================================
 * 📊 ADMIN DASHBOARD STATS - optimized (parallel execution)
 * ========================================================= */
export const getAdminDashboardStats = async (req, res) => {
  try {
    // compute counts in parallel
    const [totalRecords, approved, rejected] = await Promise.all([
      Record.countDocuments(),
      Record.countDocuments({ form60Compliance: "Approved" }),
      Record.countDocuments({ form60Compliance: "Rejected" }),
    ]);

    // weekly and monthly aggregates (limit 6) — these use aggregation framework
    const weeklyAgg = Record.aggregate([
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

    const monthlyAgg = Record.aggregate([
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

    const [weekly, monthly] = await Promise.all([weeklyAgg, monthlyAgg]);

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
        month: `${m._id.month}-${m._id.year}`,
        total: m.total,
        approved: m.approved,
        rejected: m.rejected,
      }))
      .reverse();

    return res.status(200).json({
      success: true,
      totalRecords,
      approved,
      rejected,
      weekly: weeklyFormatted,
      monthly: monthlyFormatted,
    });
  } catch (err) {
    console.error("getAdminDashboardStats error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch admin dashboard stats",
        error: err.message,
      });
  }
};

/* =========================================================
 * 🔁 QUICK READ ENDPOINTS
 * ========================================================= */
export const getRecentRecords = async (req, res) => {
  try {
    const recentRecords = await Record.find()
      .populate("courtStation", "name")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({ success: true, recentRecords });
  } catch (err) {
    console.error("getRecentRecords error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch recent records",
        error: err.message,
      });
  }
};

export const getRecordById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid record ID" });

    const record = await Record.findById(id)
      .populate("courtStation", "name level")
      .lean();
    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    return res.status(200).json({ success: true, record });
  } catch (err) {
    console.error("getRecordById error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch record",
        error: err.message,
      });
  }
};

export const getRecords = async (req, res) => {
  try {
    const { page = 1, limit = 30, search = "" } = req.query;
    const p = Math.max(Number(page), 1);
    const l = Math.max(Number(limit), 1);

    const query = search
      ? {
          $or: [
            { causeNo: { $regex: search, $options: "i" } },
            { nameOfDeceased: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [records, totalRecords] = await Promise.all([
      Record.find(query)
        .populate("courtStation", "name level")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Record.countDocuments(query),
    ]);

    return res.json({
      success: true,
      records,
      currentPage: p,
      totalPages: Math.ceil(totalRecords / l),
      totalRecords,
    });
  } catch (err) {
    console.error("Get records error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch records",
        error: err.message,
      });
  }
};

/* =========================================================
 * ✅ VERIFY RECORDS - mark published
 * ========================================================= */
export const verifyRecords = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length)
      return res
        .status(400)
        .json({
          success: false,
          message: "No record IDs provided for verification",
        });

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!validIds.length)
      return res
        .status(400)
        .json({ success: false, message: "Invalid record IDs" });

    const result = await Record.updateMany(
      { _id: { $in: validIds } },
      { $set: { statusAtGP: "Published", datePublished: new Date() } }
    );

    return res
      .status(200)
      .json({
        success: true,
        message: "Records verified successfully",
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });
  } catch (err) {
    console.error("verifyRecords error:", err.message || err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to verify records",
        error: err.message,
      });
  }
};
