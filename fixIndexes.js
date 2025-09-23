// server/fixIndexes.js
import mongoose from "mongoose";

const run = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://principalregistry_db_user:pr.@cluster0.pn94ibf.mongodb.net/PRF60?retryWrites=true&w=majority&appName=Cluster0"
    );
    console.log("✅ Connected to DB");

    const db = mongoose.connection.db;
    const collection = db.collection("courts"); // Updated collection name

    // 1. Show current indexes
    const indexes = await collection.indexes();
    console.log("📌 Current Indexes:", indexes);

    // 2. Drop old indexes if they exist
    const dropIfExists = async (indexName) => {
      const exists = indexes.find((idx) => idx.name === indexName);
      if (exists) {
        await collection.dropIndex(indexName);
        console.log(`❌ Dropped index: ${indexName}`);
      }
    };

    await dropIfExists("name_1"); // Drop default single-field index on name
    await dropIfExists("code_1"); // Drop default single-field index on code
    await dropIfExists("name_1_code_1"); // Drop old compound index if it exists

    // 3. Recreate the compound index
    await collection.createIndex(
      { name: 1, code: 1 },
      { unique: true }
    );
    console.log("✅ Created compound index: { name, code }");

    console.log("🎉 Indexes fixed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error fixing indexes:", err);
    process.exit(1);
  }
};

run();
