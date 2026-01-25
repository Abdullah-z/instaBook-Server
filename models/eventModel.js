const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: "user", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    image: { type: String },
    address: { type: String, required: true },
    location: {
      type: { type: String, default: "Point" },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    interested: [{ type: mongoose.Types.ObjectId, ref: "user" }],
    going: [{ type: mongoose.Types.ObjectId, ref: "user" }],
    deleteAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

eventSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("event", eventSchema);
