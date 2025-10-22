import mongoose from "mongoose";

const caseSchema = new mongoose.Schema({
  courtStation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Court", // <-- Reference Court model
  },
  nameOfDeceased: { type: String },
  causeNo: { type: String },
  status: { type: String, default: "Pending" },
});

const gazetteSchema = new mongoose.Schema(
  {
    volumeNo: { type: String, required: true },
    datePublished: { type: Date, required: true },
    fileName: { type: String, required: true },
    cases: [caseSchema],
    publishedCount: { type: Number, default: 0 },
    totalRecords: { type: Number, default: 0 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Gazette", gazetteSchema);
