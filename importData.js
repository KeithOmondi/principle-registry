import mongoose from "mongoose";
import xlsx from "xlsx";
import Record from "./models/Record.js"; // your schema
import Court from "./models/Court.js";   // court reference schema

// 1. Connect to DB
const MONGO_URI = "mongodb+srv://principalregistry_db_user:pr.@cluster0.pn94ibf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
await mongoose.connect(MONGO_URI);
console.log("✅ Connected to MongoDB");

// 2. Load Excel file
const workbook = xlsx.readFile("C:/Users/JUD_USER/Downloads/data.xlsx");
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(sheet);

// 3. Transform + Save
for (const row of rows) {
  try {
    // 🔹 find or create courtStation by name
    const court = await Court.findOne({ name: row["Court Station"] });
    if (!court) {
      console.log(`⚠️ Court not found: ${row["Court Station"]}`);
      continue;
    }

    // 🔹 Map Excel columns to schema
    const record = new Record({
      no: row["No"], 
      courtStation: court._id,
      causeNo: row["Cause No."],
      nameOfDeceased: row["Name of the Deceased"],
      dateReceived: new Date(row["Date Received at CP/Returned to Station"]),
      dateOfReceipt: new Date(row["Date on E-Citizen Receipt"]),
      leadTime: Number(row["Lead Time"]),
      form60Compliance: row["Form 60 compliance"] || "Approved",
      rejectionReason: row["Reason for Rejection"] || "",
      statusAtGP: row["Status at the C.P"] || "Pending",
      volumeNo: row["Column 10"] || "",
      datePublished: row["Date Published"] ? new Date(row["Date Published"]) : null,
      dateForwardedToGP: row["Date Forwarded to GP"] ? new Date(row["Date Forwarded to GP"]) : null,
    });

    await record.save();
    console.log(`✅ Saved record for: ${row["Name of the Deceased"]}`);
  } catch (err) {
    console.error(`❌ Error saving ${row["Name of the Deceased"]}:`, err.message);
  }
}

console.log("🎉 Import complete");
process.exit();
