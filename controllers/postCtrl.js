const Posts = require("../models/postModel");
const Comments = require("../models/commentModel");
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

const postCtrl = {
  createPost: async (req, res) => {
    try {
      const { content, images, postType = "feed" } = req.body;

      if (images.length === 0 && (!content || content.length === 0)) {
        return res.status(400).json({ msg: "Please add photo(s) or content" });
      }

      const createFeedPost = async () => {
        const newPost = new Posts({
          content,
          images,
          user: req.user._id,
          isStory: false,
        });
        await newPost.save();
        return newPost;
      };

      const createStoryPost = async () => {
        const newStory = new Posts({
          content,
          images,
          user: req.user._id,
          isStory: true,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        await newStory.save();
        return newStory;
      };

      let newPost;

      if (postType === "feed") {
        newPost = await createFeedPost();
      } else if (postType === "story") {
        newPost = await createStoryPost();
      } else if (postType === "both") {
        newPost = await createFeedPost();
        await createStoryPost(); // Create story silently
      }

      res.json({
        msg: "Post created successfully.",
        newPost: {
          ...newPost._doc,
          user: req.user,
        },
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getPosts: async (req, res) => {
    try {
      const features = new APIfeatures(
        Posts.find({
          user: [...req.user.following, req.user._id],
          isStory: { $ne: true }, // Exclude stories
        }),
        req.query
      ).paginating();
      const posts = await features.query
        .sort("-createdAt")
        .populate("user likes", "avatar username fullname followers")
        .populate({
          path: "comments",
          populate: {
            path: "user likes ",
            select: "-password",
          },
        });

      res.json({
        msg: "Success",
        result: posts.length,
        posts,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getStories: async (req, res) => {
    try {
      const followingIds = [...req.user.following, req.user._id];
      // Find stories from users we follow (plus self) that haven't expired
      // Note: check for isStory: true and expiresAt > now (handled by mongo TTL often, but good to be explicit query side too)
      const stories = await Posts.find({
        user: { $in: followingIds },
        isStory: true,
        expiresAt: { $gt: Date.now() },
      })
        .populate("user", "avatar username fullname")
        .sort("-createdAt");

      // Group stories by user
      const groupedStories = stories.reduce((acc, story) => {
        const userId = story.user._id.toString();
        if (!acc[userId]) {
          acc[userId] = {
            user: story.user,
            stories: [],
          };
        }
        acc[userId].stories.push(story);
        return acc;
      }, {});

      // Convert object to array
      const result = Object.values(groupedStories);

      // Put 'me' first if exists
      const myId = req.user._id.toString();
      const myStoriesIndex = result.findIndex(
        (item) => item.user._id.toString() === myId
      );

      if (myStoriesIndex > -1) {
        const [myStories] = result.splice(myStoriesIndex, 1);
        result.unshift(myStories);
      }

      res.json({
        msg: "Success",
        result: result.length,
        stories: result,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  updatePost: async (req, res) => {
    try {
      const { content, images } = req.body;

      const post = await Posts.findOneAndUpdate(
        { _id: req.params.id },
        {
          content,
          images,
        }
      )
        .populate("user likes", "avatar username fullname")
        .populate({
          path: "comments",
          populate: {
            path: "user likes ",
            select: "-password",
          },
        });

      res.json({
        msg: "Post updated successfully.",
        newPost: {
          ...post._doc,
          content,
          images,
        },
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  likePost: async (req, res) => {
    try {
      const post = await Posts.find({
        _id: req.params.id,
        likes: req.user._id,
      });
      if (post.length > 0) {
        return res
          .status(400)
          .json({ msg: "You have already liked this post" });
      }

      const like = await Posts.findOneAndUpdate(
        { _id: req.params.id },
        {
          $push: { likes: req.user._id },
        },
        {
          new: true,
        }
      );

      if (!like) {
        return res.status(400).json({ msg: "Post does not exist." });
      }

      res.json({ msg: "Post liked successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  unLikePost: async (req, res) => {
    try {
      const like = await Posts.findOneAndUpdate(
        { _id: req.params.id },
        {
          $pull: { likes: req.user._id },
        },
        {
          new: true,
        }
      );

      if (!like) {
        return res.status(400).json({ msg: "Post does not exist." });
      }

      res.json({ msg: "Post unliked successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getUserPosts: async (req, res) => {
    try {
      const features = new APIfeatures(
        Posts.find({ user: req.params.id, isStory: { $ne: true } }),
        req.query
      ).paginating();
      const posts = await features.query.sort("-createdAt");

      const totalPosts = await Posts.countDocuments({
        user: req.params.id,
        isStory: { $ne: true },
      });

      res.json({
        posts,
        result: posts.length,
        totalPosts,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getPost: async (req, res) => {
    try {
      const post = await Posts.findById(req.params.id)
        .populate("user likes", "avatar username fullname followers")
        .populate({
          path: "comments",
          populate: {
            path: "user likes ",
            select: "-password",
          },
        });

      if (!post) {
        return res.status(400).json({ msg: "Post does not exist." });
      }

      res.json({ post });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getPostDiscover: async (req, res) => {
    try {
      const newArr = [...req.user.following, req.user._id];

      const num = req.query.num || 8;

      console.log("getPostDiscover debug:", {
        userId: req.user._id,
        followingCount: req.user.following.length,
        excludeUsers: newArr.length,
        numParam: num,
      });

      const posts = await Posts.aggregate([
        { $match: { user: { $nin: newArr } } },
        { $sample: { size: Number(num) } },
      ]);

      console.log(`Found ${posts.length} discover posts`);

      res.json({
        msg: "Success",
        result: posts.length,
        posts,
      });
    } catch (err) {
      console.error("getPostDiscover error:", err);
      return res.status(500).json({ msg: err.message });
    }
  },

  getReels: async (req, res) => {
    try {
      const page = req.query.page * 1 || 1;
      const limit = req.query.limit * 1 || 10;
      const skip = (page - 1) * limit;

      // Find posts where images array has an item with resource_type: 'video' OR url ends with .mp4
      const posts = await Posts.aggregate([
        {
          $match: {
            images: {
              $elemMatch: {
                $or: [{ resource_type: "video" }, { url: { $regex: /mp4$/i } }],
              },
            },
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            "user.password": 0,
            "user.role": 0,
            "user.gender": 0,
            "user.mobile": 0,
            "user.address": 0,
            "user.website": 0,
            "user.email": 0, // hide email
          },
        },
      ]);

      res.json({
        msg: "Success",
        result: posts.length,
        posts,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  deletePost: async (req, res) => {
    try {
      const post = await Posts.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!post) {
        return res
          .status(400)
          .json({ msg: "Post not found or not authorized" });
      }

      await Comments.deleteMany({ _id: { $in: post.comments } });

      // Delete images from Cloudinary
      if (post.images && post.images.length > 0) {
        for (const image of post.images) {
          // Check if image object has public_id
          if (image.public_id) {
            await deleteImage(image.public_id, image.resource_type || "image");
          }
        }
      }

      res.json({
        msg: "Post deleted successfully.",
        newPost: {
          ...post._doc, // Access _doc to be safe with Mongoose document
          user: req.user,
        },
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  reportPost: async (req, res) => {
    try {
      const post = await Posts.find({
        _id: req.params.id,
        reports: req.user._id,
      });
      if (post.length > 0) {
        return res
          .status(400)
          .json({ msg: "You have already reported this post" });
      }

      const report = await Posts.findOneAndUpdate(
        { _id: req.params.id },
        {
          $push: { reports: req.user._id },
        },
        {
          new: true,
        }
      );

      if (!report) {
        return res.status(400).json({ msg: "Post does not exist." });
      }

      res.json({ msg: "Post reported successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  savePost: async (req, res) => {
    try {
      const user = await Users.find({
        _id: req.user._id,
        saved: req.params.id,
      });
      if (user.length > 0) {
        return res
          .status(400)
          .json({ msg: "You have already saved this post." });
      }

      const save = await Users.findOneAndUpdate(
        { _id: req.user._id },
        {
          $push: { saved: req.params.id },
        },
        {
          new: true,
        }
      );

      if (!save) {
        return res.status(400).json({ msg: "User does not exist." });
      }

      res.json({ msg: "Post saved successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  unSavePost: async (req, res) => {
    try {
      const save = await Users.findOneAndUpdate(
        { _id: req.user._id },
        {
          $pull: { saved: req.params.id },
        },
        {
          new: true,
        }
      );

      if (!save) {
        return res.status(400).json({ msg: "User does not exist." });
      }

      res.json({ msg: "Post removed from collection successfully." });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getSavePost: async (req, res) => {
    try {
      const features = new APIfeatures(
        Posts.find({ _id: { $in: req.user.saved } }),
        req.query
      ).paginating();

      const savePosts = await features.query.sort("-createdAt");

      res.json({
        savePosts,
        result: savePosts.length,
        savePosts,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = postCtrl;
