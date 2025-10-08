import mongoose from "mongoose";

const recordSchema = new mongoose.Schema(
  {
    no: {
      type: Number,
      required: true,
      unique: true,
    },
    courtStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Court",
      required: true,
    },
    causeNo: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Optional: enforce unique cause number per year
    },
    nameOfDeceased: {
      type: String,
      required: true,
      trim: true,
    },
    dateReceived: {
      type: Date,
      required: true,
    },
    dateOfReceipt: {
      type: Date,
    },
    leadTime: {
      type: Number,
      required: true,
    },
    dateForwardedToGP: {
      type: Date,
      default: null,
    },
    form60Compliance: {
      type: String,
      enum: ["Approved", "Rejected"],
      default: "Approved",
    },
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },
    statusAtGP: {
      type: String,
      enum: ["Pending", "Published"],
      default: "Pending",
    },
    volumeNo: {
      type: String,
      default: "",
      trim: true,
    },
    datePublished: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Record", recordSchema);
