import asyncHandler from "express-async-handler";
import fs from "fs/promises";
import pdfParse from "pdf-parse";
import Record from "../models/Record.js";
import Gazette from "../models/Gazette.js";
import Court from "../models/Court.js";
import ScanLog from "../models/scanLogModel.js"

export const scanGazette = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("No PDF file uploaded");
    }

    if (!req.user?._id) {
      res.status(401);
      throw new Error("User not authenticated");
    }

    // 1️⃣ Read and parse PDF
    const pdfBuffer = await fs.readFile(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    let text = pdfData.text.replace(/\s+/g, " ").trim();

    console.log("📄 PDF sample:", text.slice(0, 400));

    // 2️⃣ Extract Gazette metadata
    const volumeMatch = text.match(/Vol\.?\s*[A-Z]*\s*[—-]?\s*No\.?\s*\d+/i);
    const dateMatch = text.match(/\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)[,]?\s+\d{4}\b/i);

    const volumeNo = volumeMatch ? volumeMatch[0].replace(/Vol\.?\s*/i, "").trim() : "Unknown Volume";
    const datePublished = dateMatch
      ? new Date(dateMatch[0].replace(/(st|nd|rd|th)/, ""))
      : new Date();

    console.log("📘 Volume:", volumeNo, "| 📅 Date:", datePublished);

    // 3️⃣ Split Gazette by courts
    const courtSections = text.split(/IN THE HIGH COURT OF KENYA AT\s+/i).slice(1);
    const extractedCases = [];

    for (const section of courtSections) {
      const courtName = section.match(/^([A-Z]+)/i)?.[1]?.trim().toUpperCase() || "UNKNOWN";
      const courtDoc = await Court.findOne({ name: { $regex: courtName, $options: "i" } });
      const courtStationId = courtDoc ? courtDoc._id : null;

      // Extract individual causes for this court
      const causeBlocks = section.match(/CAUSE\s+NO\.\s*[\w/]+\s+.*?(?=(CAUSE\s+NO\.|GAZETTE NOTICE|$))/gis) || [];

      for (const block of causeBlocks) {
        const causeNo = block.match(/CAUSE\s+NO\.\s*[\w/]+/i)?.[0]?.replace("CAUSE NO.", "").trim() || "N/A";

        // Extract Deceased Name
        const deceasedMatch = block.match(/estate\s+of\s+([A-Z\s.'’]+?)(?=,|\slate|\swho|\sdeceased)/i);
        const nameOfDeceased = deceasedMatch
          ? deceasedMatch[1].replace(/\s+/g, " ").trim()
          : "Unknown Deceased";

        extractedCases.push({
          causeNo,
          courtStation: courtStationId,
          courtName,
          nameOfDeceased: nameOfDeceased.toLowerCase(),
          volumeNo,
          datePublished,
          status: "Published",
        });
      }
    }

    console.log(`🧾 Extracted ${extractedCases.length} cases`);

    // 4️⃣ Match with DB records (PDF = source of truth)
    const matchedCases = [];
    for (const c of extractedCases) {
      const record = await Record.findOne({
        nameOfDeceased: { $regex: `^${c.nameOfDeceased}$`, $options: "i" },
      });

      if (record) {
        record.statusAtGP = "Published";
        record.volumeNo = volumeNo;
        record.datePublished = datePublished;
        await record.save();

        matchedCases.push({
          ...c,
          recordId: record._id,
          courtStation: record.courtStation,
        });
      }
    }

    console.log(`✅ Matched ${matchedCases.length} with DB`);

    // 5️⃣ Save Gazette and Log
    const gazette = await Gazette.create({
      uploadedBy: req.user._id,
      fileName: req.file.originalname,
      volumeNo,
      datePublished,
      totalRecords: extractedCases.length,
      publishedCount: matchedCases.length,
      cases: matchedCases,
    });

    await ScanLog.create({
      uploadedBy: req.user._id,
      fileName: req.file.originalname,
      totalRecords: extractedCases.length,
      publishedCount: matchedCases.length,
      remarks: `Gazette ${req.file.originalname} scanned successfully.`,
      volumeNo,
      datePublished,
    });

    await fs.unlink(req.file.path).catch(() => {});

    res.status(201).json({
      message: "Scan completed successfully",
      gazette,
      publishedCount: matchedCases.length,
      totalRecords: extractedCases.length,
      tableData: matchedCases.map(c => ({
        volumeNo: c.volumeNo,
        courtStation: c.courtName,
        nameOfDeceased: c.nameOfDeceased,
        causeNo: c.causeNo,
        datePublished: c.datePublished,
      })),
    });
  } catch (err) {
    console.error("❌ scanGazette error:", err.message);
    res.status(500).json({ message: "Failed to scan Gazette", error: err.message });
  }
});



/* ======================================================
   🧩 Get All Gazettes
====================================================== */
export const getGazettes = asyncHandler(async (req, res) => {
  const gazettes = await Gazette.find()
    .populate("uploadedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  const gazettesWithPreview = await Promise.all(
    gazettes.map(async (gazette) => {
      // ⚙️ Relax filters to avoid mismatches (volume dash differences, etc.)
      const dbRecords = await Record.find({
        nameOfDeceased: {
          $in: gazette.cases.map((c) => new RegExp(`^${c.nameOfDeceased}$`, "i")),
        },
      })
        .populate("courtStation", "name")
        .lean();

      // 🧮 Keep only published ones (safely filter in code)
      const publishedCases = dbRecords
        .filter((r) => r.statusAtGP?.toLowerCase() === "published")
        .map((r) => ({
          volumeNo: gazette.volumeNo,
          courtStation: r.courtStation?.name || "Unknown",
          nameOfDeceased: r.nameOfDeceased,
          causeNo: r.causeNo,
          datePublished: gazette.datePublished,
        }));

      return {
        _id: gazette._id.toString(),
        volumeNo: gazette.volumeNo,
        datePublished: gazette.datePublished,
        uploadedBy: gazette.uploadedBy,
        totalRecords: gazette.totalRecords,
        publishedCount: publishedCases.length,
        casePreview: publishedCases.slice(0, 3),
      };
    })
  );

  res.status(200).json({
    success: true,
    count: gazettesWithPreview.length,
    gazettes: gazettesWithPreview,
  });
});



/* ======================================================
   🧩 Get Gazette Details
====================================================== */
/* ======================================================
   🧩 Get Gazette Details (Detailed Table)
====================================================== */
/* ======================================================
   🧩 Get Gazette Details (Robust Matching for Full Table)
====================================================== */
export const getGazetteDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id.match(/^[0-9a-fA-F]{24}$/)) throw new Error("Invalid Gazette ID");

  const gazette = await Gazette.findById(id)
    .populate("uploadedBy", "name email")
    .lean();

  if (!gazette) throw new Error("Gazette not found");

  // 🧩 Match more flexibly (ignore case, spacing, etc.)
  const dbRecords = await Record.find({
    nameOfDeceased: {
      $in: gazette.cases.map((c) => new RegExp(`^${c.nameOfDeceased}$`, "i")),
    },
  })
    .populate("courtStation", "name")
    .lean();

  // 🧮 Keep only published ones (and avoid nulls)
  const tableCases = dbRecords
    .filter((r) => r.statusAtGP?.toLowerCase() === "published")
    .map((r) => ({
      volumeNo: gazette.volumeNo,
      courtStation: r.courtStation?.name || "Unknown",
      nameOfDeceased: r.nameOfDeceased,
      causeNo: r.causeNo,
      datePublished: gazette.datePublished,
    }));

  res.status(200).json({
    success: true,
    gazette: {
      _id: gazette._id.toString(),
      fileName: gazette.fileName,
      volumeNo: gazette.volumeNo,
      datePublished: gazette.datePublished,
      uploadedBy: gazette.uploadedBy,
      totalRecords: gazette.totalRecords,
      publishedCount: tableCases.length,
      cases: tableCases,
    },
  });
});



/* ======================================================
   🧾 Get Scan Logs
====================================================== */
export const getScanLogs = asyncHandler(async (req, res) => {
  const logs = await ScanLog.find()
    .populate("uploadedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ logs });
});
