import mongoose from "mongoose";

const recordSchema = new mongoose.Schema(
  {
    no: { type: Number, required: true, unique: true }, // Auto-increment
    courtStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Court", // references Court collection
      required: true,
    },
    causeNo: { type: String, required: true },
    nameOfDeceased: { type: String, required: true },
    dateReceived: { type: Date, required: true },
    dateOfReceipt: { type: Date, required: true },
    leadTime: { type: Number, required: true }, // calculated
    form60Compliance: {
      type: String,
      enum: ["Approved", "Rejected"],
      default: "Approved",
    },
    rejectionReason: { type: String, default: "" },
    statusAtGP: {
      type: String,
      enum: ["Pending", "Published"],
      default: "Pending",
    },
    volumeNo: { type: String, default: "" },
    datePublished: { type: Date },
    dateForwardedToGP: { type: Date }, // NEW FIELD
  },
  { timestamps: true }
);

export default mongoose.model("Record", recordSchema);
