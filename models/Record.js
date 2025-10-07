import mongoose from "mongoose";

const recordSchema = new mongoose.Schema(
  {
    no: { type: Number, required: false, unique: true },

    courtStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Court",
      required: true,
    },

    causeNo: { type: String, required: true },

    nameOfDeceased: { type: String, required: true },

    dateReceived: { type: Date, required: true },

    dateOfReceipt: { type: Date, default: null },

    leadTime: { type: Number, required: true },

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

    dateForwardedToGP: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Record", recordSchema);
