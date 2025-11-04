import mongoose from "mongoose";

/**
 * ==============================
 * RECORD SCHEMA
 * ==============================
 */
const recordSchema = new mongoose.Schema(
  {
    no: { type: Number, required: true, unique: true },
    courtStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Court",
      required: true,
    },
    causeNo: { type: String, required: true, trim: true, unique: true },
    nameOfDeceased: { type: String, required: true, trim: true },

    dateReceived: { type: Date, required: true },
    dateOfReceipt: { type: Date },
    dateForwardedToGP: { type: Date },

    receivingLeadTime: { type: Number, default: null },
    forwardingLeadTime: { type: Number, default: null },

    form60Compliance: {
      type: String,
      enum: ["Approved", "Rejected"],
      default: "Approved",
    },
    rejectionReason: { type: String, trim: true, default: "" },
    statusAtGP: {
      type: String,
      enum: ["Pending", "Published"],
      default: "Pending",
    },
    volumeNo: { type: String, trim: true, default: "" },
    datePublished: { type: Date, default: null },
  },
  { timestamps: true }
);

/* =========================================================
 * 🧮 AUTO-COMPUTE LEAD TIMES (SAVE + UPDATE)
 * ========================================================= */
recordSchema.pre("save", function (next) {
  if (this.dateReceived && this.dateOfReceipt) {
    this.receivingLeadTime = Math.ceil(
      (new Date(this.dateOfReceipt) - new Date(this.dateReceived)) /
        (1000 * 60 * 60 * 24)
    );
  } else {
    this.receivingLeadTime = null;
  }

  if (this.dateReceived && this.dateForwardedToGP) {
    this.forwardingLeadTime = Math.ceil(
      (new Date(this.dateForwardedToGP) - new Date(this.dateReceived)) /
        (1000 * 60 * 60 * 24)
    );
  } else {
    this.forwardingLeadTime = null;
  }

  next();
});

recordSchema.pre(["findOneAndUpdate", "updateOne"], function (next) {
  const update = this.getUpdate();

  if (update.dateReceived && update.dateOfReceipt) {
    update.receivingLeadTime = Math.ceil(
      (new Date(update.dateOfReceipt) - new Date(update.dateReceived)) /
        (1000 * 60 * 60 * 24)
    );
  } else if (update.dateReceived || update.dateOfReceipt) {
    update.receivingLeadTime = null;
  }

  if (update.dateReceived && update.dateForwardedToGP) {
    update.forwardingLeadTime = Math.ceil(
      (new Date(update.dateForwardedToGP) - new Date(update.dateReceived)) /
        (1000 * 60 * 60 * 24)
    );
  } else if (update.dateReceived || update.dateForwardedToGP) {
    update.forwardingLeadTime = null;
  }

  next();
});

export default mongoose.model("Record", recordSchema);
