// controllers/gazetteController.js
import asyncHandler from "express-async-handler";
import Record from "../models/Record.js"; // ASSUMED CORRECT IMPORT
import Gazette from "../models/Gazette.js";
import ScanLog from "../models/scanLogModel.js"; // ASSUMED CORRECT IMPORT
import fs from "fs";
import pdfParse from "pdf-parse";

// ... existing code ...

export const scanGazette = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No PDF file uploaded");
  }

  // --- 🧠 Read and parse PDF ---  <-- RESTORED BLOCK
  const pdfBuffer = fs.readFileSync(req.file.path);
  const pdfData = await pdfParse(pdfBuffer);
  const text = pdfData.text.replace(/\s+/g, " ").trim();
  // -----------------------------

  // --- 🧭 Extract Gazette Metadata ---
  const volumeMatch =
    text.match(/Vol\.?\s*[A-Z]+\s*[—-]?\s*No\.?\s*\d+/i) ||
    text.match(/Volume\s+[A-Z]+\s*No\.?\s*\d+/i);

  const dateMatch =
    text.match(
      /(Published\s+on\s+)?\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\b/i
    ) ||
    text.match(
      /\b\d{1,2}(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i
    );

  const volumeNo = volumeMatch ? volumeMatch[0].trim() : "Unknown Volume";
  const datePublished = dateMatch
    ? new Date(dateMatch[0].replace(/(st|nd|rd|th)/, ""))
    : new Date();

  console.log("📘 Extracted Volume:", volumeNo);
  console.log("📅 Extracted Date:", datePublished);

  // --- ⚖️ Extract Case Data ---
  const causeBlocks =
    text.match(/(Cause\s+No\.?\s*\d+\/\d{4}.*?)(?=Cause\s+No\.|\Z)/gis) || [];

  const extractedCases = causeBlocks.map((block) => {
    const causeNo =
      block.match(/Cause\s+No\.?\s*\d+\/\d{4}/i)?.[0]?.trim() || "N/A";
    const courtStation =
      block.match(/HIGH\s+COURT\s+AT\s+[A-Z]+/i)?.[0]?.trim() ||
      "Unknown Station";
    const nameOfDeceased =
      block
        .match(/(Estate\s+of\s+)?[A-Z][A-Z\s']+(?=\s*(deceased|–|—))/i)?.[0]
        ?.replace(/Estate\s+of\s+/i, "")
        ?.trim() || "Unknown Deceased";

    return {
      causeNo,
      courtStation,
      nameOfDeceased,
      // FIX 1: Add volumeNo here to be consistent with the updated caseSchema
      volumeNo, 
      datePublished,
      status: "Published",
    };
  });

  console.log(`🧾 Extracted ${extractedCases.length} cases`);

  // --- 📋 Match & Update Records in DB ---
  const records = await Record.find();
  let publishedCount = 0;
  const updatedRecords = [];

  for (const record of records) {
    const name = record.nameOfDeceased?.trim().toLowerCase();
    
    // Use the cause number for a more precise match instead of the deceased's name in the whole text.
    // However, sticking to your existing name matching logic:
    if (text.toLowerCase().includes(name)) {
      record.statusAtGP = "Published";
      record.datePublished = datePublished;
      record.volumeNo = volumeNo;
      await record.save();
      publishedCount++;
      updatedRecords.push(record);
    }
  }

  // --- 🧾 Save Gazette ---
  const gazette = await Gazette.create({
    uploadedBy: req.user._id,
    fileName: req.file.originalname,
    volumeNo,
    datePublished,
    totalRecords: records.length,
    // totalRecords should reflect the total number of records *scanned against*
    totalRecords: records.length,
    publishedCount,
    cases: extractedCases,
  });

  // --- 🧾 Save Scan Log ---
  await ScanLog.create({
    uploadedBy: req.user._id,
    fileName: req.file.originalname,
    totalRecords: records.length,
    publishedCount,
    remarks: `Gazette ${req.file.originalname} scanned successfully.`,
    volumeNo,
    datePublished,
  });
  
  // --- 🧹 Cleanup ---
  fs.unlink(req.file.path, (err) => {
    if (err) console.warn("⚠️ Failed to delete temp file:", err.message);
  });

  // FIX 2: Include publishedCount and totalRecords in the response payload
  res.json({
    message: "Scan completed successfully",
    gazette,
    updatedRecords,
    publishedCount, 
    totalRecords: records.length, 
  });
});

/* ======================================================
   🧩 Get All Gazettes
   - Returns a list of all gazettes with metadata only
====================================================== */
export const getGazettes = asyncHandler(async (req, res) => {
  try {
    const gazettes = await Gazette.find()
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: gazettes.length,
      gazettes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch gazettes",
      error: error.message,
    });
  }
});


/**
 * @desc   Get details for a specific Gazette (including cases)
 * @route  GET /api/v1/gazette/:id
 * @access Admin
 */
export const getGazetteById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find gazette by ID and populate uploader details
  const gazette = await Gazette.findById(id)
    .populate("uploadedBy", "name email")
    .lean();

  if (!gazette) {
    res.status(404);
    throw new Error("Gazette not found");
  }

  res.json({
    success: true,
    gazette,
  });
});

export const getGazetteDetails = asyncHandler(async (req, res) => {
  const gazette = await Gazette.findById(req.params.id).populate('cases'); 
  // NOTE: Assuming your Gazette model has a 'cases' field that references the case records

  if (gazette) {
    res.json({
      _id: gazette._id,
      fileName: gazette.fileName,
      datePublished: gazette.datePublished,
      volumeNo: gazette.volumeNo,
      totalRecords: gazette.cases.length, // Total number of cases found in this gazette
      cases: gazette.cases, // The list of individual case records
      // Add any other necessary fields
    });
  } else {
    // Crucial for the client to catch this!
    res.status(404);
    throw new Error('Gazette not found'); 
  }
});

/**
 * @desc Fetch all scan logs
 * @route GET /api/v1/gazette/logs
 * @access Admin
 */
export const getScanLogs = asyncHandler(async (req, res) => {
  const logs = await ScanLog.find()
    .populate("uploadedBy", "name email")
    .sort({ createdAt: -1 });

  res.json({ logs });
});
