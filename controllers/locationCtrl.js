const Location = require("../models/locationModel");
const User = require("../models/userModel");

// Share location
exports.shareLocation = async (req, res) => {
  try {
    const { latitude, longitude, visibility } = req.body;

    const location = await Location.findOneAndUpdate(
      { user: req.user._id },
      { latitude, longitude, visibility },
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
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const followingIds = user.following || [];

    const locations = await Location.find({
      $or: [
        { visibility: "public" },
        { visibility: "friends", user: { $in: followingIds } },
        { user: req.user._id }, // Always include self
      ],
    }).populate("user", "username fullname avatar");

    res.status(200).json(locations);
  } catch (err) {
    console.error("getSharedLocations error:", err);
    res
      .status(500)
      .json({
        message: "Internal server error while fetching locations",
        error: err.message,
      });
  }
};
