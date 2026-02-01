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
      color: { type: String },
      fontWeight: { type: String, default: "normal" },
    },
    poll_question: String,
    poll_options: [
      {
        text: String,
        votes: [{ type: mongoose.Types.ObjectId, ref: "user" }],
      },
    ],
    hashtags: [{ type: String, lowercase: true, index: true }],
    isEdited: { type: Boolean, default: false },
    sharedPost: {
      type: mongoose.Types.ObjectId,
      ref: "post",
    },
    createdAt: Date,
    updatedAt: Date,
  },
  {
    timestamps: true,
  },
);

postSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("post", postSchema);
