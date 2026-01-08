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
    listingType: {
      type: String,
      enum: ["Sell", "Bid", "Both"],
      default: "Sell",
    },
    currentBid: { type: Number, default: 0 },
    highestBidder: { type: mongoose.Types.ObjectId, ref: "user" },
    bidEndTime: { type: Date },
    bidHistory: [
      {
        user: { type: mongoose.Types.ObjectId, ref: "user" },
        amount: { type: Number },
        time: { type: Date, default: Date.now },
      },
    ],
    auctionCompleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Create 2dsphere index for location queries
listingSchema.index({ location: "2dsphere" });

// TTL Index REMOVED to allow manual cleanup of images before deletion.
// listingSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });
listingSchema.index({ deleteAt: 1 }); // Standard index for efficient querying

module.exports = mongoose.model("listing", listingSchema);
