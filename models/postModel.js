const mongoose = require("mongoose");
const { Schema } = mongoose;

const postSchema = new Schema(
  {
    content: String,
    images: {
      type: Array,
      default: [],
    },
    likes: [
      {
        type: mongoose.Types.ObjectId,
        ref: "user",
      },
    ],
    comments: [
      {
        type: mongoose.Types.ObjectId,
        ref: "comment",
      },
    ],
    user: {
      type: mongoose.Types.ObjectId,
      ref: "user",
    },
    reports: [
      {
        type: mongoose.Types.ObjectId,
        ref: "user",
      },
    ],
    isStory: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      // index: { expires: 0 },
    },
    address: String,
    location: {
      type: { type: String, default: "Point" },
      coordinates: { type: [Number], index: "2dsphere" },
    },
    background: String,
    textStyle: {
      fontSize: { type: Number, default: 20 },
      color: { type: String, default: "#000000" },
      fontWeight: { type: String, default: "normal" },
    },
  },
  {
    timestamps: true,
  },
);

postSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("post", postSchema);
