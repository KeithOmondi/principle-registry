import mongoose from "mongoose";

const recordSchema = new mongoose.Schema(
  {
    no: { 
      type: Number, 
      required: true, 
      unique: true 
    }, // Auto-increment number

    courtStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Court", // References the Court collection
      required: true,
    },

    causeNo: { 
      type: String, 
      required: true,
      unique: false
    },

    nameOfDeceased: { 
      type: String, 
      required: true 
    },

    dateReceived: { 
      type: Date, 
      required: true 
    },

    dateOfReceipt: { 
      type: Date,
      required: false,
      default: null
    },

    leadTime: { 
      type: Number, 
      required: true 
    }, // Auto-calculated field

    form60Compliance: {
      type: String,
      enum: ["Approved", "Rejected"],
      default: "Approved",
    },

    rejectionReason: { 
      type: String, 
      default: "" 
    },

    statusAtGP: {
      type: String,
      enum: ["Pending", "Published"],
      default: "Pending",
    },

    volumeNo: { 
      type: String, 
      default: "" 
    },

    datePublished: { 
      type: Date 
    },

    dateForwardedToGP: { 
      type: Date 
    }, // ✅ New field added
  },
  { timestamps: true }
);

export default mongoose.model("Record", recordSchema);
