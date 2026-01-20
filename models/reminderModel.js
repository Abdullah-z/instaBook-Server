const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: "user" },
    text: { type: String, required: true },
    remindAt: { type: Date, required: true },
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "completed"],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("reminder", reminderSchema);
