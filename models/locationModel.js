const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    visibility: {
      type: String,
      enum: ["friends", "public"],
      required: true,
    },
    type: {
      type: String,
      enum: ["live", "static"],
      default: "live",
    },
    expiresAt: {
      type: Date,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

locationSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("location", locationSchema);
