// server/fixIndexes.js
import mongoose from "mongoose";

const MONGO_URI =
  "mongodb+srv://principalregistry_db_user:pr.@cluster0.pn94ibf.mongodb.net/PRF60?retryWrites=true&w=majority&appName=Cluster0";

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to DB");

    const db = mongoose.connection.db;

    /* =====================================================
     * 🧩 1. FIX COUNTERS COLLECTION
     * ===================================================== */
    const counters = db.collection("counters");
    console.log("\n🔧 Fixing counters collection...");

    const counterIndexes = await counters.indexes();
    console.log("📌 Current counter indexes:", counterIndexes);

    // Drop existing index on "name" if exists
    const counterIndex = counterIndexes.find((idx) => idx.name === "name_1");
    if (counterIndex) {
      await counters.dropIndex("name_1");
      console.log("❌ Dropped old index: name_1");
    }

    // Delete any docs where name is null or missing
    const counterCleanup = await counters.deleteMany({
      $or: [{ name: null }, { name: { $exists: false } }],
    });
    if (counterCleanup.deletedCount > 0)
      console.log(`🧹 Deleted ${counterCleanup.deletedCount} invalid counter document(s)`);

    // Recreate proper unique index
    await counters.createIndex({ name: 1 }, { unique: true });
    console.log("✅ Counters collection cleaned successfully!");

    /* =====================================================
     * 🧩 2. FIX RECORDS COLLECTION
     * ===================================================== */
    const records = db.collection("records");
    console.log("\n🔧 Fixing records collection...");

    const recordIndexes = await records.indexes();
    console.log("📌 Current record indexes:", recordIndexes);

    // Drop old index on "no" if it exists
    const recordIndex = recordIndexes.find((idx) => idx.name === "no_1");
    if (recordIndex) {
      await records.dropIndex("no_1");
      console.log("❌ Dropped old index: no_1");
    }

    // Remove invalid or duplicate entries where "no" is null or missing
    const cleanupResult = await records.deleteMany({
      $or: [{ no: null }, { no: { $exists: false } }],
    });
    if (cleanupResult.deletedCount > 0)
      console.log(`🧹 Deleted ${cleanupResult.deletedCount} invalid record(s)`);

    // Create proper unique index (only for documents with a valid "no")
    await records.createIndex(
      { no: 1 },
      {
        unique: true,
        partialFilterExpression: { no: { $exists: true } },
      }
    );

    console.log("✅ Created clean unique index on { no: 1 }");
    console.log("🎉 All indexes fixed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error fixing indexes:", err);
    process.exit(1);
  }
};

run();
