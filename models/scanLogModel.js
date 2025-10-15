import mongoose from "mongoose";

const scanLogSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    totalRecords: {
      type: Number,
      required: true,
    },
    publishedCount: {
      type: Number,
      required: true,
    },
    remarks: {
      type: String,
      default: "",
      trim: true,
    },
    dateScanned: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ScanLog", scanLogSchema);
