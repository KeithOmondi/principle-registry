// controllers/gazetteScannerController.js
import asyncHandler from "express-async-handler";
import fs from "fs/promises";
import pdfParse from "pdf-parse";

import Record from "../models/Record.js";
import Gazette from "../models/Gazette.js";
import ScanLog from "../models/scanLogModel.js";
import Court from "../models/Court.js";

// --- 🧹 Scan Gazette ---
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

    // 3️⃣ Async read PDF
    const pdfBuffer = await fs.readFile(req.file.path);

    // Optional: Timeout wrapper for large PDFs
    const pdfData = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("PDF parse timeout")), 30000);
      pdfParse(pdfBuffer)
        .then((data) => {
          clearTimeout(timeout);
          resolve(data);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    const text = pdfData.text.replace(/\s+/g, " ").trim();

    // 4️⃣ Extract Gazette metadata
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

    console.log("📘 Volume:", volumeNo, "| 📅 Date:", datePublished);

    // 5️⃣ Extract case blocks
    const causeBlocks =
      text.match(/(Cause\s+No\.?\s*\d+\/\d{4}.*?)(?=Cause\s+No\.|\Z)/gis) || [];

    if (causeBlocks.length === 0) console.warn("⚠️ No cases extracted from PDF");

    const extractedCases = await Promise.all(
      causeBlocks.map(async (block) => {
        const causeNo = block.match(/Cause\s+No\.?\s*\d+\/\d{4}/i)?.[0]?.trim() || "N/A";

        const courtNameMatch =
          block.match(/HIGH\s+COURT\s+AT\s+[A-Z]+/i)?.[0]?.trim() || "Unknown Station";

        const courtDoc = await Court.findOne({ name: courtNameMatch.toUpperCase() });
        const courtStationId = courtDoc ? courtDoc._id : null;

        const nameOfDeceased =
          block
            .match(/(Estate\s+of\s+)?[A-Z][A-Z\s']+(?=\s*(deceased|–|—))/i)?.[0]
            ?.replace(/Estate\s+of\s+/i, "")
            ?.trim() || "Unknown Deceased";

        return {
          causeNo,
          courtStation: courtStationId,
          nameOfDeceased,
          volumeNo,
          datePublished,
          status: "Published",
        };
      })
    );

    console.log(`🧾 Extracted ${extractedCases.length} cases`);

    // 6️⃣ Update Records in DB
    const records = await Record.find().populate("courtStation", "name");
    let publishedCount = 0;
    const updatedRecords = [];

    for (const record of records) {
      const name = record.nameOfDeceased?.trim().toLowerCase();
      if (text.toLowerCase().includes(name)) {
        record.statusAtGP = "Published";
        record.datePublished = datePublished;
        record.volumeNo = volumeNo;
        await record.save();
        publishedCount++;
        updatedRecords.push(record);
      }
    }

    // 7️⃣ Save Gazette
    const gazette = await Gazette.create({
      uploadedBy: req.user._id,
      fileName: req.file.originalname,
      volumeNo,
      datePublished,
      totalRecords: records.length,
      publishedCount,
      cases: extractedCases,
    });

    // 8️⃣ Save Scan Log
    await ScanLog.create({
      uploadedBy: req.user._id,
      fileName: req.file.originalname,
      totalRecords: records.length,
      publishedCount,
      remarks: `Gazette ${req.file.originalname} scanned successfully.`,
      volumeNo,
      datePublished,
    });

    // 9️⃣ Cleanup
    fs.unlink(req.file.path).catch((err) =>
      console.warn("⚠️ Failed to delete temp file:", err.message)
    );

    // 🔟 Return response
    res.status(201).json({
      message: "Scan completed successfully",
      gazette,
      updatedRecords,
      publishedCount,
      totalRecords: records.length,
    });
  } catch (err) {
    console.error("❌ scanGazette error:", err.message);
    res.status(500).json({ message: "Failed to scan Gazette", error: err.message });
  }
});

/* ======================================================
   🧩 Get All Gazettes (with case preview)
====================================================== */
export const getGazettes = asyncHandler(async (req, res) => {
  try {
    const gazettes = await Gazette.find()
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const gazettesWithCasePreview = await Promise.all(
      gazettes.map(async (gazette) => {
        const casePreview = await Promise.all(
          gazette.cases.slice(0, 3).map(async (caseItem) => {
            if (caseItem.courtStation) {
              const court = await Court.findById(caseItem.courtStation).lean();
              return {
                ...caseItem,
                courtStation: court
                  ? { _id: court._id, name: court.name, level: court.level }
                  : null,
              };
            }
            return caseItem;
          })
        );

        return {
          _id: gazette._id,
          fileName: gazette.fileName,
          volumeNo: gazette.volumeNo,
          datePublished: gazette.datePublished,
          totalRecords: gazette.cases.length,
          publishedCount: gazette.publishedCount,
          uploadedBy: gazette.uploadedBy,
          casePreview,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: gazettesWithCasePreview.length,
      gazettes: gazettesWithCasePreview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch gazettes",
      error: error.message,
    });
  }
});

// Get Gazette Details with case court info
export const getGazetteDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const gazette = await Gazette.findById(id)
    .populate("uploadedBy", "name email")
    .lean();

  if (!gazette) {
    res.status(404);
    throw new Error("Gazette not found");
  }

  const populatedCases = await Promise.all(
    gazette.cases.map(async (caseItem) => {
      if (caseItem.courtStation) {
        const court = await Court.findById(caseItem.courtStation).lean();
        return {
          ...caseItem,
          courtStation: court
            ? { _id: court._id, name: court.name, level: court.level }
            : null,
        };
      }
      return caseItem;
    })
  );

  res.json({
    _id: gazette._id,
    fileName: gazette.fileName,
    datePublished: gazette.datePublished,
    volumeNo: gazette.volumeNo,
    totalRecords: populatedCases.length,
    cases: populatedCases,
    uploadedBy: gazette.uploadedBy,
    publishedCount: gazette.publishedCount,
  });
});

// Fetch scan logs
export const getScanLogs = asyncHandler(async (req, res) => {
  const logs = await ScanLog.find()
    .populate("uploadedBy", "name email")
    .sort({ createdAt: -1 });

  res.json({ logs });
});
