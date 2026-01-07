const mongoose = require("mongoose");
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    recipients: [{ type: mongoose.Types.ObjectId, ref: "user" }],
    text: String,
    media: Array,
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, default: "" },
    groupAvatar: {
      type: String,
      default:
        "https://res.cloudinary.com/devatchannel/image/upload/v1602752402/avatar/avatar_cugq40.png",
    },
    admins: [{ type: mongoose.Types.ObjectId, ref: "user" }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("conversation", conversationSchema);
