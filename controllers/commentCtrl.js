const Comments = require("../models/commentModel");
const Posts = require("../models/postModel");

const Notifies = require("../models/notifyModel");
const Users = require("../models/userModel");

const handleMentions = async (
  content,
  user,
  url,
  text = "mentioned you in a comment.",
) => {
  if (!content) return;
  const mentions = content.match(/@(\w+)/g);
  if (!mentions) return;

  const usernames = mentions.map((m) => m.slice(1));
  const uniqueUsernames = [...new Set(usernames)];

  const taggedUsers = await Users.find({ username: { $in: uniqueUsernames } });

  for (const taggedUser of taggedUsers) {
    if (taggedUser._id.toString() === user._id.toString()) continue;

    const msg = {
      id: user._id,
      text,
      recipients: [taggedUser._id],
      url,
      content,
      image: "",
      user: user._id,
    };

    const notify = new Notifies(msg);
    await notify.save();

    const { sendPushNotification } = require("../socketServer");
    if (taggedUser.pushToken) {
      await sendPushNotification(taggedUser._id, user.username, text, { url });
    }
  }
};

const commentCtrl = {
  createComment: async (req, res) => {
    try {
      const { postId, content, tag, reply, postUserId } = req.body;

      const post = await Posts.findById(postId);
      if (!post) {
        return res.status(400).json({ msg: "Post does not exist." });
      }

      if (reply) {
        const cm = await Comments.findById(reply);
        if (!cm) {
          return res.status(400).json({ msg: "Comment does not exist." });
        }
      }

      const newComment = new Comments({
        user: req.user._id,
        content,
        tag,
        reply,
        postUserId,
        postId,
      });

      await Posts.findOneAndUpdate(
        { _id: postId },
        {
          $push: { comments: newComment._id },
        },
        { new: true },
      );

      await newComment.save();
      res.json({ newComment });

      // Handle Mentions
      handleMentions(
        content,
        req.user,
        `/post/${postId}`,
        "mentioned you in a comment.",
      );
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  updateComment: async (req, res) => {
    try {
      const { content } = req.body;

      await Comments.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { content, isEdited: true },
      );

      res.json({ msg: "updated successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  likeComment: async (req, res) => {
    try {
      const comment = await Comments.find({
        _id: req.params.id,
        likes: req.user._id,
      });
      if (comment.length > 0) {
        return res
          .status(400)
          .json({ msg: "You have already liked this post" });
      }

      await Comments.findOneAndUpdate(
        { _id: req.params.id },
        {
          $push: { likes: req.user._id },
        },
        {
          new: true,
        },
      );

      res.json({ msg: "Comment liked successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  unLikeComment: async (req, res) => {
    try {
      await Comments.findOneAndUpdate(
        { _id: req.params.id },
        {
          $pull: { likes: req.user._id },
        },
        {
          new: true,
        },
      );

      res.json({ msg: "Comment unliked successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  deleteComment: async (req, res) => {
    try {
      const comment = await Comments.findOneAndDelete({
        _id: req.params.id,
        $or: [{ user: req.user._id }, { postUserId: req.user._id }],
      });

      await Posts.findOneAndUpdate(
        { _id: comment.postId },
        {
          $pull: { comments: req.params.id },
        },
      );
      res.json({ msg: "Comment deleted successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = commentCtrl;
