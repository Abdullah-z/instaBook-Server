const Users = require("../models/userModel");
const { deleteImageByUrl } = require("../utils/cloudinary");

const userCtrl = {
  searchUser: async (req, res) => {
    try {
      const users = await Users.find({
        username: { $regex: req.query.username, $options: "i" },
      })
        .limit(10)
        .select("fullname username avatar");

      res.json({ users });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getUser: async (req, res) => {
    try {
      const user = await Users.findById(req.params.id)
        .select("-password")
        .populate(
          "followers following followRequests sentFollowRequests",
          "-password",
        );

      if (!user) {
        return res.status(400).json({ msg: "requested user does not exist." });
      }

      res.json({ user });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getUserByUsername: async (req, res) => {
    try {
      const user = await Users.findOne({ username: req.params.username })
        .select("-password")
        .populate(
          "followers following followRequests sentFollowRequests",
          "-password",
        );

      if (!user) {
        return res.status(400).json({ msg: "requested user does not exist." });
      }

      res.json({ user });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  updateUser: async (req, res) => {
    try {
      const {
        avatar,
        fullname,
        mobile,
        address,
        story,
        website,
        gender,
        cover,
        isPrivate,
      } = req.body;
      if (!fullname) {
        return res.status(400).json({ msg: "Please add your full name." });
      }

      // Check and delete old images if they are being replaced
      const currentUser = await Users.findById(req.user._id);

      if (
        avatar &&
        avatar !== currentUser.avatar &&
        currentUser.avatar &&
        currentUser.avatar.includes("cloudinary")
      ) {
        await deleteImageByUrl(currentUser.avatar);
      }

      if (
        cover &&
        cover !== currentUser.cover &&
        currentUser.cover &&
        currentUser.cover.includes("cloudinary")
      ) {
        await deleteImageByUrl(currentUser.cover);
      }

      await Users.findOneAndUpdate(
        { _id: req.user._id },
        {
          avatar,
          fullname,
          mobile,
          address,
          story,
          website,
          gender,
          cover,
          isPrivate,
        },
      );

      res.json({ msg: "Profile updated successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  savePushToken: async (req, res) => {
    try {
      const { pushToken } = req.body;

      await Users.findOneAndUpdate({ _id: req.user._id }, { pushToken });

      res.json({ msg: "Push token saved successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  follow: async (req, res) => {
    try {
      // Check if user to be followed exists and checking privacy
      const targetUser = await Users.findById(req.params.id);
      if (!targetUser)
        return res.status(400).json({ msg: "User does not exist." });

      const user = await Users.find({
        _id: req.params.id,
        followers: req.user._id,
      });
      if (user.length > 0)
        return res
          .status(400)
          .json({ msg: "You are already following this user." });

      // Check if already requested
      const requested = await Users.find({
        _id: req.params.id,
        followRequests: req.user._id,
      });
      if (requested.length > 0)
        return res
          .status(400)
          .json({ msg: "You have already sent a follow request." });

      // If Private, send request
      if (targetUser.isPrivate) {
        await Users.findOneAndUpdate(
          { _id: req.params.id },
          { $push: { followRequests: req.user._id } },
          { new: true },
        );
        await Users.findOneAndUpdate(
          { _id: req.user._id },
          { $push: { sentFollowRequests: req.params.id } },
          { new: true },
        );
        return res.json({ msg: "Follow request sent." });
      }

      // If Public, follow directly
      const newUser = await Users.findOneAndUpdate(
        { _id: req.params.id },
        {
          $push: {
            followers: req.user._id,
          },
        },
        { new: true },
      ).populate("followers following", "-password");

      await Users.findOneAndUpdate(
        { _id: req.user._id },
        { $push: { following: req.params.id } },
        { new: true },
      );

      res.json({ newUser });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  acceptFollowRequest: async (req, res) => {
    try {
      // req.params.id is the user ID who sent the request (the aspiring follower)
      // req.user._id is the user accepting (the private account)

      const aspiringFollowerId = req.params.id;
      const myId = req.user._id;

      const me = await Users.findById(myId);
      if (
        !me.followRequests ||
        !me.followRequests.includes(aspiringFollowerId)
      ) {
        return res
          .status(400)
          .json({ msg: "No follow request from this user." });
      }

      // 1. Add to my followers, remove from my followRequests
      const updatedMe = await Users.findOneAndUpdate(
        { _id: myId },
        {
          $push: { followers: aspiringFollowerId },
          $pull: { followRequests: aspiringFollowerId },
        },
        { new: true },
      ).populate("followers following followRequests", "-password");

      // 2. Add me to their following, remove from their sentFollowRequests
      await Users.findOneAndUpdate(
        { _id: aspiringFollowerId },
        {
          $push: { following: myId },
          $pull: { sentFollowRequests: myId },
        },
        { new: true },
      );

      res.json({ msg: "Follow request accepted.", user: updatedMe });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  rejectFollowRequest: async (req, res) => {
    try {
      const aspiringFollowerId = req.params.id;
      const myId = req.user._id;

      // 1. Remove from my followRequests
      const updatedMe = await Users.findOneAndUpdate(
        { _id: myId },
        {
          $pull: { followRequests: aspiringFollowerId },
        },
        { new: true },
      ).populate("followers following followRequests", "-password");

      // 2. Remove from their sentFollowRequests
      await Users.findOneAndUpdate(
        { _id: aspiringFollowerId },
        {
          $pull: { sentFollowRequests: myId },
        },
        { new: true },
      );

      res.json({ msg: "Follow request rejected.", user: updatedMe });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  unfollow: async (req, res) => {
    try {
      // Check if it was just a request or an actual follow
      // Remove from both to be safe and cover 'cancelling request' scenario
      const newUser = await Users.findOneAndUpdate(
        { _id: req.params.id },
        {
          $pull: { followers: req.user._id, followRequests: req.user._id },
        },
        { new: true },
      ).populate("followers following", "-password");

      await Users.findOneAndUpdate(
        { _id: req.user._id },
        {
          $pull: {
            following: req.params.id,
            sentFollowRequests: req.params.id,
          },
        },
        { new: true },
      );

      res.json({ newUser });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  suggestionsUser: async (req, res) => {
    try {
      const newArr = [...(req.user.following || []), req.user._id];

      const num = req.query.num || 10;
      const users = await Users.aggregate([
        { $match: { _id: { $nin: newArr } } },
        { $sample: { size: Number(num) } },
        {
          $lookup: {
            from: "users",
            localField: "followers",
            foreignField: "_id",
            as: "followers",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "following",
            foreignField: "_id",
            as: "following",
          },
        },
      ]).project("-password");

      return res.json({
        users,
        result: users.length,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  getAIUser: async (req, res) => {
    try {
      const user = await Users.findOne({ role: "ai_assistant" }).select(
        "-password",
      );
      res.json({ user });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = userCtrl;
