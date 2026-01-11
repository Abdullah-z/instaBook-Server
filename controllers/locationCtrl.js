const Location = require("../models/locationModel");
const User = require("../models/userModel");

// Share location
exports.shareLocation = async (req, res) => {
  try {
    const { latitude, longitude, visibility } = req.body;

    const location = new Location({
      user: req.user.id,
      latitude,
      longitude,
      visibility,
    });

    await location.save();
    res.status(201).json({ message: "Location shared successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fetch shared locations
exports.getSharedLocations = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("friends");
    const friendIds = user.friends.map((friend) => friend._id);

    const locations = await Location.find({
      $or: [
        { visibility: "public" },
        { visibility: "friends", user: { $in: friendIds } },
      ],
    }).populate("user", "username");

    res.status(200).json(locations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
