const mongoose = require("mongoose");

const shoutoutSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
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
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    visibility: {
      type: String,
      enum: ["friends", "public"],
      default: "public",
    },
    expiresAt: {
      type: Date,
      index: { expires: 0 }, // Automatically delete after this date
    },
  },
  {
    timestamps: true,
  },
);

shoutoutSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("shoutout", shoutoutSchema);
