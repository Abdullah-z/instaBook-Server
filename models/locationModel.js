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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Location", locationSchema);
