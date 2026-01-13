const Location = require("../models/locationModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

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
  console.log(
    ">>> [locationRouter] GET /shared requested by user:",
    req.user._id
  );
  const start = Date.now();
  try {
    const { lat, lon, radius } = req.query;
    console.log(
      `[Location Fetch] Params: lat=${lat}, lon=${lon}, radius=${radius}`
    );
    const user = await User.findById(req.user._id).select("following");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const followingIds = user.following || [];
    const allRelevantIds = [...followingIds, req.user._id];

    // 0. Migration Check: Ensure old records have the 'location' GeoJSON field
    // This runs in the background to fix documents that only have latitude/longitude
    Location.updateMany(
      {
        location: { $exists: false },
        latitude: { $exists: true },
        longitude: { $exists: true },
      },
      [
        {
          $set: {
            location: {
              type: "Point",
              coordinates: ["$longitude", "$latitude"],
            },
          },
        },
      ]
    )
      .then((res) => {
        if (res.modifiedCount > 0)
          console.log(
            `[Location Migration] Updated ${res.modifiedCount} old records.`
          );
      })
      .catch((err) => console.error("[Location Migration] Error:", err));

    // 0.1 Cleanup Expired Locations (Background)
    Location.deleteMany({ expiresAt: { $lte: new Date() } }).catch((err) =>
      console.error("[Location Cleanup] Error:", err)
    );

    // 1. Fetch active sharing sessions
    let query = {
      expiresAt: { $gt: new Date() }, // Only active sessions
      $or: [
        { visibility: "public" },
        { visibility: "friends", user: { $in: followingIds } },
        { user: req.user._id }, // Always include self
      ],
    };

    const r = parseFloat(radius);
    const useGeo = lat && lon && r && r < 10000;

    if (useGeo) {
      query.location = {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          $maxDistance: r * 1000,
        },
      };
    }

    let locations = [];
    try {
      console.log(`[Location Fetch] Query:`, JSON.stringify(query));
      locations = await Location.find(query)
        .populate("user", "username fullname avatar")
        .limit(100);
      console.log(
        `[Location Fetch] Active sharing found: ${locations.length} (Time: ${
          Date.now() - start
        }ms)`
      );
    } catch (err) {
      console.error("[Location Fetch] Error finding locations:", err);
      // Fallback: If geospatial query fails (index still building?), try without it
      if (useGeo) {
        console.log("[Location Fetch] Retrying without geo query...");
        delete query.location;
        locations = await Location.find(query)
          .populate("user", "username fullname avatar")
          .limit(100);
        console.log(
          `[Location Fetch] Fallback successful (Time: ${Date.now() - start}ms)`
        );
      } else {
        throw err;
      }
    }

    // 2. Fetch post markers
    const Posts = require("../models/postModel");
    const { targetUserId, timePeriod } = req.query;
    let pipeline = [];

    // 1. Build postMatch
    const postMatch = {
      location: { $exists: true },
      isStory: { $ne: true },
    };

    // Filter by user(s)
    if (targetUserId) {
      postMatch.user = mongoose.Types.ObjectId(targetUserId);
    } else if (r < 10000) {
      postMatch.user = { $in: allRelevantIds };
    }

    // Filter by timePeriod
    if (timePeriod && timePeriod !== "all") {
      const now = new Date();
      let startTime = new Date();
      if (timePeriod === "day") startTime.setDate(now.getDate() - 1);
      else if (timePeriod === "month") startTime.setMonth(now.getMonth() - 1);
      else if (timePeriod === "year")
        startTime.setFullYear(now.getFullYear() - 1);
      postMatch.createdAt = { $gte: startTime };
    }

    pipeline.push({ $match: postMatch });
    pipeline.push({ $sort: { createdAt: -1 } });

    // If NO targetUserId, show only 1 latest post per user
    if (!targetUserId) {
      pipeline.push({
        $group: {
          _id: "$user",
          latestPost: { $first: "$$ROOT" },
        },
      });
    } else {
      // If targetUserId, we want ALL posts as separate markers
      // Wrap them in latestPost structure for compatibility with existing project mapping
      pipeline.push({
        $project: {
          _id: 0,
          latestPost: "$$ROOT",
        },
      });
    }

    // 2. If radius specified (and not "All"), filter by distance
    if (useGeo && !targetUserId) {
      const radiusInRadians = r / 6378.1;
      pipeline.push({
        $match: {
          "latestPost.location": {
            $geoWithin: {
              $centerSphere: [
                [parseFloat(lon), parseFloat(lat)],
                radiusInRadians,
              ],
            },
          },
        },
      });
    }

    pipeline.push({ $limit: 100 });
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDetails",
      },
    });
    pipeline.push({ $unwind: "$userDetails" });
    pipeline.push({
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
    });

    console.log(`[Location Fetch] Post Pipeline:`, JSON.stringify(pipeline));
    let latestPostsAgg = [];
    try {
      latestPostsAgg = await Posts.aggregate(pipeline);
      console.log(
        `[Location Fetch] Latest posts found: ${latestPostsAgg.length} (Time: ${
          Date.now() - start
        }ms)`
      );
    } catch (err) {
      console.error("[Location Fetch] Aggregation error:", err);
      // Fallback for aggregation similarly if needed, but usually index is same
    }

    const postMarkers = latestPostsAgg
      .filter(
        (item) =>
          item.latestPost &&
          item.latestPost.location &&
          item.latestPost.location.coordinates
      )
      .map((item) => {
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
      ...locations.map((l) => ({
        ...(l.toObject ? l.toObject() : l),
        lastUpdate: l.updatedAt,
      })),
      ...postMarkers,
    ];
    console.log(
      `[Location Fetch] Final Markers - Shared: ${locations.length}, Posts: ${
        postMarkers.length
      }, Total: ${combined.length} (Total Time: ${Date.now() - start}ms)`
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
