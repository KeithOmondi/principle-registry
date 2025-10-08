// server/fixRecordIndexes.js
import mongoose from "mongoose";

const run = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://principalregistry_db_user:pr.@cluster0.pn94ibf.mongodb.net/PRF60?retryWrites=true&w=majority&appName=Cluster0"
    );
    console.log("✅ Connected to DB");

    const db = mongoose.connection.db;
    const collection = db.collection("records");

    // 1. Show current indexes
    const indexes = await collection.indexes();
    console.log("📌 Current Indexes:", indexes);

    // 2. Drop old index on "no" if it exists
    const dropIfExists = async (indexName) => {
      const exists = indexes.find((idx) => idx.name === indexName);
      if (exists) {
        await collection.dropIndex(indexName);
        console.log(`❌ Dropped index: ${indexName}`);
      }
    };

    await dropIfExists("no_1");

    // 3. Recreate correct unique index with partial filter
    await collection.createIndex(
      { no: 1 },
      {
        unique: true,
        partialFilterExpression: { no: { $exists: true, $ne: null } },
      }
    );

    console.log("✅ Created partial unique index on { no: 1 }");
    console.log("🎉 Record indexes fixed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error fixing record indexes:", err);
    process.exit(1);
  }
};

run();
