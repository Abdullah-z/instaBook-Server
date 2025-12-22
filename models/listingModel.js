const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: "user", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, default: "Other" },
    images: [{ type: String, required: true }],
    address: { type: String, required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    phone: { type: String, required: true },
    isSold: { type: Boolean, default: false },
    soldAt: { type: Date },
    deleteAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Create 2dsphere index for location queries
listingSchema.index({ location: "2dsphere" });

// Create TTL index to delete posts 24 hours after they are marked as sold
// Note: deleteAt will be set when isSold is set to true
listingSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("listing", listingSchema);
