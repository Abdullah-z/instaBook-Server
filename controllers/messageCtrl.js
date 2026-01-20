const Conversations = require("../models/conversationModel");
const Messages = require("../models/messageModel");
const Users = require("../models/userModel");
const { deleteImage } = require("../utils/cloudinary");

class APIfeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  paginating() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 9;
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}

const messageCtrl = {
  createMessage: async (req, res) => {
    try {
      const { recipient, text, media, call, location, conversationId } =
        req.body;
      if (
        (!recipient && !conversationId) ||
        (!text?.trim() && (!media || media.length === 0) && !call && !location)
      )
        return;

      if (conversationId) {
        // Group Message
        const conversation = await Conversations.findById(conversationId);
        if (!conversation)
          return res.status(400).json({ msg: "Conversation not found" });

        const newMessage = new Messages({
          conversation: conversation._id,
          sender: req.user._id,
          text,
          media,
          call,
          location,
        });

        await newMessage.save();

        await Conversations.findOneAndUpdate(
          { _id: conversation._id },
          {
            text: text || (location ? "📍 Shared a location" : ""),
            media,
          },
        );

        return res.json({ msg: "Created.", newMessage });
      }

      // 1-on-1 Message
      let conversationText = text;
      if (!conversationText && call) {
        let statusText =
          call.status === "missed"
            ? "Missed"
            : call.status === "rejected"
              ? "Declined"
              : "";
        conversationText = `${statusText} ${
          call.video ? "video" : "voice"
        } call`.trim();
        conversationText =
          conversationText.charAt(0).toUpperCase() + conversationText.slice(1);
      } else if (!conversationText && location) {
        conversationText = "📍 Shared a location";
      }

      const newConversation = await Conversations.findOneAndUpdate(
        {
          $or: [
            { recipients: [req.user._id, recipient] },
            { recipients: [recipient, req.user._id] },
          ],
        },
        {
          recipients: [req.user._id, recipient],
          text: conversationText,
          media,
        },
        { new: true, upsert: true },
      );

      const newMessage = new Messages({
        conversation: newConversation._id,
        sender: req.user._id,
        recipient,
        text,
        media,
        call,
        location,
      });

      await newMessage.save();

      // --- AI Assistant Logic ---
      const recipientUser = await Users.findById(recipient);
      if (recipientUser && recipientUser.role === "ai_assistant") {
        const aiCtrl = require("./aiCtrl");
        // Get recent history for context (last 10 messages)
        const history = await Messages.find({
          conversation: newConversation._id,
        })
          .sort("-createdAt")
          .limit(10)
          .populate("sender", "role");

        const { text: aiResponseText, searchResults } =
          await aiCtrl.generateAIResponse(
            history.reverse(),
            text,
            req.user._id,
          );

        const aiMessage = new Messages({
          conversation: newConversation._id,
          sender: recipient, // AI Assistant
          recipient: req.user._id,
          text: aiResponseText,
          searchResults: searchResults, // Save the structural results
        });

        await aiMessage.save();

        // Update conversation with AI's reply
        await Conversations.findByIdAndUpdate(newConversation._id, {
          text: aiResponseText,
        });

        return res.json({
          msg: "Created.",
          newMessage,
          aiMessage: { ...aiMessage._doc, sender: recipientUser },
        });
      }
      // --------------------------

      res.json({ msg: "Created.", newMessage });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  createGroup: async (req, res) => {
    try {
      const { groupName, recipients } = req.body;
      if (recipients.length < 2)
        return res
          .status(400)
          .json({ msg: "Group must have at least 2 other members." });

      const newConversation = new Conversations({
        recipients: [...recipients, req.user._id],
        groupName,
        isGroup: true,
        admins: [req.user._id],
        user: req.user._id,
      });

      await newConversation.save();
      res.json({ conversation: newConversation });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getConversations: async (req, res) => {
    try {
      const features = new APIfeatures(
        Conversations.find({
          recipients: req.user._id,
        }),
        req.query,
      ).paginating();

      const conversations = await features.query
        .sort("-updatedAt")
        .populate("recipients", "avatar username fullname");

      res.json({
        conversations,
        result: conversations.length,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getMessages: async (req, res) => {
    try {
      // Check if id is a Group Conversation
      const conversation = await Conversations.findOne({
        _id: req.params.id,
        isGroup: true,
      });

      let query;
      if (conversation) {
        // Fetch messages for this group conversation
        query = Messages.find({ conversation: req.params.id });
      } else {
        // Fetch messages for 1-on-1 (req.params.id is userId)
        query = Messages.find({
          $or: [
            { sender: req.user._id, recipient: req.params.id },
            { sender: req.params.id, recipient: req.user._id },
          ],
        });
      }

      const features = new APIfeatures(query, req.query).paginating();

      const messages = await features.query
        .sort("-createdAt")
        .populate("sender", "avatar username fullname"); // Populate sender for groups

      res.json({
        messages,
        result: messages.length,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  deleteConversation: async (req, res) => {
    try {
      const { id } = req.params;

      // Try to find group conversation first
      let conversation = await Conversations.findOneAndDelete({
        _id: id,
        isGroup: true,
        admins: req.user._id, // Only admin can delete group? Or just owner logic
      });

      // If not group, try 1-on-1
      if (!conversation) {
        conversation = await Conversations.findOneAndDelete({
          $or: [
            { recipients: [req.user._id, id] },
            { recipients: [id, req.user._id] },
          ],
        });
      }

      if (!conversation) {
        return res
          .status(400)
          .json({ msg: "Conversation not found or not authorized" });
      }

      // Find messages with media in this conversation
      const messagesWithMedia = await Messages.find({
        conversation: conversation._id,
        media: { $exists: true, $not: { $size: 0 } },
      });

      // Delete images from Cloudinary
      for (const msg of messagesWithMedia) {
        for (const mediaItem of msg.media) {
          if (mediaItem.public_id) {
            await deleteImage(mediaItem.public_id);
          }
        }
      }

      // Delete all messages in this conversation
      await Messages.deleteMany({ conversation: conversation._id });

      res.json({ msg: "Conversation deleted successfully" });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  updateGroup: async (req, res) => {
    try {
      const { id } = req.params;
      const { groupName, groupAvatar, recipients } = req.body;

      // Find group and check permissions (assuming only admins can update for now, or anyone in group)
      // For simplicity, letting any member update or just admins. Let's stick to members.
      const conversation = await Conversations.findOne({
        _id: id,
        isGroup: true,
        recipients: req.user._id,
      });

      if (!conversation)
        return res.status(400).json({ msg: "Group not found" });

      if (groupName) conversation.groupName = groupName;
      if (groupAvatar) conversation.groupAvatar = groupAvatar;
      if (recipients) {
        // Ensure current user is still in recipients if not explicitly removed logic handled by frontend
        // Or simpler: recipients list replaces old list.
        // Let's assume recipients contains the NEW full list of members.
        conversation.recipients = recipients;
      }

      await conversation.save();

      res.json({ msg: "Update Success!", conversation });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = messageCtrl;
