const Location = require("../models/locationModel");
const User = require("../models/userModel");

// Share location
exports.shareLocation = async (req, res) => {
  try {
    const { latitude, longitude, visibility, type, duration } = req.body;

    const hours = parseInt(duration) || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const location = await Location.findOneAndUpdate(
      { user: req.user._id },
      {
        latitude,
        longitude,
        location: { type: "Point", coordinates: [longitude, latitude] },
        visibility,
        type,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    res
      .status(200)
      .json({ message: "Location shared successfully!", location });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fetch shared locations
exports.getSharedLocations = async (req, res) => {
  const start = Date.now();
  try {
    const { lat, lon, radius } = req.query;
    console.log(
      `[Location Fetch] Params: lat=${lat}, lon=${lon}, radius=${radius}`
    );
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const followingIds = user.following || [];
    const allRelevantIds = [...followingIds, req.user._id];

    // 1. Fetch active sharing sessions
    let query = {
      $or: [
        { visibility: "public" },
        { visibility: "friends", user: { $in: followingIds } },
        { user: req.user._id }, // Always include self
      ],
    };

    // Apply geospatial filter if coordinates and radius are provided
    if (lat && lon && radius) {
      const radiusInMeters = parseFloat(radius) * 1000;
      query.location = {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          $maxDistance: radiusInMeters,
        },
      };
    }

    const locations = await Location.find(query)
      .populate("user", "username fullname avatar")
      .limit(100);
    console.log(
      `[Location Fetch] Active sharing found: ${locations.length} (Time: ${
        Date.now() - start
      }ms)`
    );

    // 2. Fetch LATEST post with location for each user using aggregation
    const Posts = require("../models/postModel");

    // We also want to filter latest posts by proximity if center is provided
    let postMatch = {
      user: { $in: allRelevantIds },
      location: { $exists: true },
      address: { $exists: true },
      isStory: false,
    };

    if (lat && lon && radius) {
      const radiusInMeters = parseFloat(radius) * 1000;
      postMatch.location = {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          $maxDistance: radiusInMeters,
        },
      };
    }

    const latestPostsAgg = await Posts.aggregate([
      { $match: postMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$user",
          latestPost: { $first: "$$ROOT" },
        },
      },
      { $limit: 100 }, // Limit total latest post markers
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          "latestPost.location": 1,
          "latestPost._id": 1,
          "latestPost.address": 1,
          "latestPost.createdAt": 1,
          "latestPost.content": 1,
          "latestPost.images": 1,
          "userDetails.username": 1,
          "userDetails.fullname": 1,
          "userDetails.avatar": 1,
          "userDetails._id": 1,
        },
      },
    ]);
    console.log(
      `[Location Fetch] Latest posts found: ${latestPostsAgg.length} (Time: ${
        Date.now() - start
      }ms)`
    );

    const postMarkers = latestPostsAgg.map((item) => {
      const p = item.latestPost;
      const u = item.userDetails;
      return {
        _id: `post-${p._id}`,
        user: {
          _id: u._id,
          username: u.username,
          fullname: u.fullname,
          avatar: u.avatar,
        },
        latitude: p.location.coordinates[1],
        longitude: p.location.coordinates[0],
        visibility: "friends",
        type: "post",
        address: p.address,
        lastUpdate: p.createdAt,
        postData: {
          id: p._id,
          content: p.content,
          image: p.images[0]?.url,
        },
      };
    });

    const combined = [
      ...locations.map((l) => ({ ...l._doc, lastUpdate: l.updatedAt })),
      ...postMarkers,
    ];
    console.log(
      `[Location Fetch] Total markers: ${combined.length} (Total Time: ${
        Date.now() - start
      }ms)`
    );
    res.status(200).json(combined);
  } catch (err) {
    console.error("getSharedLocations error:", err);
    res.status(500).json({
      message: "Internal server error while fetching locations",
      error: err.message,
    });
  }
};

// Stop sharing location
exports.stopSharing = async (req, res) => {
  try {
    await Location.findOneAndDelete({ user: req.user._id });
    res.status(200).json({ message: "Stopped sharing location successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
