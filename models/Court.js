import mongoose from "mongoose";

const CourtSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // Ensures all names stored consistently
    },
    level: {
      type: String,
      enum: [
        "High Court",
        "Law Courts",
        "Kadhi Court",
        "Children’s Court",
        "Sub-Registry",
        "Other",
      ],
      default: "Law Courts",
      trim: true,
    },
    magistrate: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9\s-]+$/, "Invalid phone number format"], // basic validation
    },

    // Primary email (mandatory)
    primaryEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/.+@.+\..+/, "Invalid email address"],
    },

    // Optional secondary emails (CC list)
    secondaryEmails: [
      {
        type: String,
        trim: true,
        lowercase: true,
        match: [/.+@.+\..+/, "Invalid email address"],
      },
    ],

    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    location: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Index for faster search by court name or code
CourtSchema.index({ name: 1, code: 1 });

export default mongoose.model("Court", CourtSchema);
