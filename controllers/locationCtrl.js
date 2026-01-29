const Location = require("../models/locationModel");
const Shoutout = require("../models/shoutoutModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");

// Share location
exports.shareLocation = async (req, res) => {
  try {
    const { latitude, longitude, visibility, type, duration } = req.body;

    const hours = parseInt(duration) || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // To prevent updatedAt from updating every 30 seconds when the location hasn't changed,
    // we first find the existing location and compare coords.
    const existing = await Location.findOne({ user: req.user._id });

    if (
      existing &&
      existing.latitude === latitude &&
      existing.longitude === longitude &&
      existing.visibility === visibility &&
      existing.type === type
    ) {
      // Just update expiresAt without triggering timestamps if possible,
      // or just return the existing if we don't care about shifting expiration slightly.
      // But we should at least update expiresAt.
      existing.expiresAt = expiresAt;
      await existing.save();
      return res
        .status(200)
        .json({ message: "Location updated (time only)", location: existing });
    }

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
      { upsert: true, new: true },
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
    req.user._id,
  );
  const start = Date.now();
  try {
    const { lat, lon, radius, targetUserId, timePeriod, typeFilter } =
      req.query;
    console.log(
      `[Location Fetch] Params: lat=${lat}, lon=${lon}, radius=${radius}, typeFilter=${typeFilter}`,
    );

    // Parse typeFilter - comma-separated list of types to include
    // e.g., "post" or "live,static" or "post,shoutout"
    // If not provided, include all types (default behavior)
    const requestedTypes = typeFilter
      ? typeFilter.split(",").map((t) => t.trim().toLowerCase())
      : ["live", "static", "post", "shoutout"];

    const includeLiveStatic =
      requestedTypes.includes("live") || requestedTypes.includes("static");
    const includeShoutouts = requestedTypes.includes("shoutout");
    const includePosts = requestedTypes.includes("post");

    console.log(`[Location Fetch] Requested types:`, requestedTypes);

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
      ],
    )
      .then((res) => {
        if (res.modifiedCount > 0)
          console.log(
            `[Location Migration] Updated ${res.modifiedCount} old records.`,
          );
      })
      .catch((err) => console.error("[Location Migration] Error:", err));

    // 0.1 Cleanup Expired Locations (Background)
    Location.deleteMany({ expiresAt: { $lte: new Date() } }).catch((err) =>
      console.error("[Location Cleanup] Error:", err),
    );

    // 1. Fetch active sharing sessions (live/static) - only if requested
    let locations = [];
    if (includeLiveStatic) {
      let query = {
        expiresAt: { $gt: new Date() }, // Only active sessions
      };

      if (targetUserId) {
        query.user = targetUserId;
      } else {
        query.$or = [
          // Public locations: MUST NOT be from private users
          // Current query structure for 'user' population is needed to verify 'isPrivate'
          // MongoDB simple query can't easily filter based on populated fields without aggregation.
          // However, we can use the populated user object in the 'find' result to filter in memory
          // OR better, we simply rely on the fact that if a user is PRIVATE, they shouldn't be sharing with 'public' visibility.
          // But to be safe, we can enforce:
          { visibility: "public" },
          { visibility: "friends", user: { $in: followingIds } },
          { user: req.user._id }, // Always include self
        ];
      }

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

      try {
        console.log(`[Location Fetch] Query:`, JSON.stringify(query));
        locations = await Location.find(query)
          .populate("user", "username fullname avatar isPrivate")
          .limit(100);

        // Safety Filter: Remove items where visibility is 'public' BUT user is private and NOT followed
        // This ensures private users' locations don't leak via 'public' setting if they accidentally set it
        locations = locations.filter((loc) => {
          if (!loc.user) return false;
          if (loc.user._id.toString() === req.user._id.toString()) return true; // Self is always ok
          if (followingIds.includes(loc.user._id)) return true; // Followed users ok
          if (loc.user.isPrivate) return false; // Private users NOT in following list -> Block
          return true; // Public users ok
        });

        console.log(
          `[Location Fetch] Active sharing found: ${locations.length} (Time: ${
            Date.now() - start
          }ms)`,
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
            `[Location Fetch] Fallback successful (Time: ${Date.now() - start}ms)`,
          );
        } else {
          throw err;
        }
      }
    } else {
      console.log(
        `[Location Fetch] Skipping live/static locations (not requested)`,
      );
    }

    // 1.1 Fetch shoutouts (Graffiti) - only if requested
    let shoutouts = [];
    if (includeShoutouts) {
      try {
        const shoutoutQuery = {
          expiresAt: { $gt: new Date() },
        };

        if (!targetUserId) {
          shoutoutQuery.$or = [
            { visibility: "public" },
            { visibility: "friends", user: { $in: followingIds } },
            { user: req.user._id },
          ];
        } else {
          shoutoutQuery.user = targetUserId;
        }

        const r = parseFloat(radius);
        const useGeo = lat && lon && r && r < 10000;

        if (useGeo) {
          shoutoutQuery.location = {
            $nearSphere: {
              $geometry: {
                type: "Point",
                coordinates: [parseFloat(lon), parseFloat(lat)],
              },
              $maxDistance: r * 1000,
            },
          };
        }

        shoutouts = await Shoutout.find(shoutoutQuery)
          .populate("user", "username fullname avatar isPrivate")
          .limit(50);

        shoutouts = shoutouts.filter((s) => {
          if (!s.user) return false;
          if (s.user._id.toString() === req.user._id.toString()) return true;
          if (followingIds.includes(s.user._id)) return true;
          if (s.user.isPrivate) return false;
          return true;
        });

        console.log(`[Location Fetch] Shoutouts found: ${shoutouts.length}`);
      } catch (err) {
        console.error("[Location Fetch] Shoutout error:", err);
      }
    } else {
      console.log(`[Location Fetch] Skipping shoutouts (not requested)`);
    }

    // 2. Fetch post markers - only if requested
    let postMarkers = [];
    if (includePosts) {
      const Posts = require("../models/postModel");
      let pipeline = [];

      // 1. Build postMatch
      const postMatch = {
        location: { $exists: true },
        isStory: { $ne: true },
      };

      // Filter by user(s)
      if (targetUserId) {
        postMatch.user = new mongoose.Types.ObjectId(targetUserId);
      } else {
        const r = parseFloat(radius);
        if (r < 10000) {
          postMatch.user = { $in: allRelevantIds };
        }
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
            _id: "$user",
            latestPost: "$$ROOT",
          },
        });
      }

      // 2. If radius specified (and not "All"), filter by distance
      const r = parseFloat(radius);
      const useGeo = lat && lon && r && r < 10000;
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
          "latestPost.likes": 1,
          "latestPost.comments": 1,
          "userDetails.username": 1,
          "userDetails.fullname": 1,
          "userDetails.avatar": 1,
          "userDetails._id": 1,
          "userDetails.isPrivate": 1,
        },
      });

      console.log(`[Location Fetch] Post Pipeline:`, JSON.stringify(pipeline));
      let latestPostsAgg = [];
      try {
        latestPostsAgg = await Posts.aggregate(pipeline);
        console.log(
          `[Location Fetch] Latest posts found: ${latestPostsAgg.length} (Time: ${
            Date.now() - start
          }ms)`,
        );
      } catch (err) {
        console.error("[Location Fetch] Aggregation error:", err);
        // Fallback for aggregation similarly if needed, but usually index is same
      }

      postMarkers = latestPostsAgg
        .filter(
          (item) =>
            item.latestPost &&
            item.latestPost.location &&
            item.latestPost.location.coordinates &&
            (!item.userDetails.isPrivate || // Include if NOT private
              allRelevantIds.some(
                (id) => id.toString() === item.userDetails._id.toString(),
              )), // OR if following/self
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
              resource_type: p.images[0]?.resource_type,
              likes: p.likes ? p.likes.length : 0,
              comments: p.comments ? p.comments.length : 0,
            },
          };
        });
    } else {
      console.log(`[Location Fetch] Skipping posts (not requested)`);
    }

    const combined = [
      ...locations.map((l) => ({
        ...(l.toObject ? l.toObject() : l),
        lastUpdate: l.updatedAt,
      })),
      ...shoutouts.map((s) => ({
        ...(s.toObject ? s.toObject() : s),
        type: "shoutout",
        lastUpdate: s.createdAt,
      })),
      ...postMarkers,
    ];
    console.log(
      `[Location Fetch] Final Markers - Shared: ${locations.length}, Shoutouts: ${shoutouts.length}, Posts: ${
        postMarkers.length
      }, Total: ${combined.length} (Total Time: ${Date.now() - start}ms)`,
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

// Create a shoutout (Digital Graffiti)
exports.createShoutout = async (req, res) => {
  try {
    const { content, latitude, longitude, visibility } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ message: "Content is required for a shoutout." });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const shoutout = new Shoutout({
      user: req.user._id,
      content,
      latitude,
      longitude,
      location: { type: "Point", coordinates: [longitude, latitude] },
      visibility: visibility || "public",
      expiresAt,
    });

    await shoutout.save();

    res
      .status(201)
      .json({ message: "Shoutout created successfully!", shoutout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
