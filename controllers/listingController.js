const Listings = require("../models/listingModel");

const listingCtrl = {
  createListing: async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        category,
        images,
        address,
        location,
        phone,
      } = req.body;

      if (images.length === 0)
        return res.status(400).json({ msg: "Please add your photos." });

      const newListing = new Listings({
        user: req.user._id,
        name,
        description,
        price,
        category,
        images,
        address,
        location,
        phone,
      });

      await newListing.save();

      res.json({
        msg: "Created Listing!",
        newListing: {
          ...newListing._doc,
          user: req.user,
        },
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  getListings: async (req, res) => {
    try {
      const listings = await Listings.find()
        .sort("-createdAt")
        .populate("user", "avatar username fullname");

      res.json({
        msg: "Success!",
        result: listings.length,
        listings,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  getMyListings: async (req, res) => {
    try {
      const listings = await Listings.find({ user: req.user._id })
        .sort("-createdAt")
        .populate("user", "avatar username fullname");

      res.json({
        msg: "Success!",
        result: listings.length,
        listings,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  updateListing: async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        category,
        images,
        address,
        location,
        phone,
      } = req.body;

      const listing = await Listings.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        {
          name,
          description,
          price,
          category,
          images,
          address,
          location,
          phone,
        },
        { new: true }
      ).populate("user", "avatar username fullname");

      if (!listing)
        return res
          .status(400)
          .json({ msg: "Listing not found or unauthorized." });

      res.json({
        msg: "Updated Listing!",
        listing,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  deleteListing: async (req, res) => {
    try {
      const listing = await Listings.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!listing)
        return res
          .status(400)
          .json({ msg: "Listing not found or unauthorized." });

      res.json({ msg: "Deleted Listing!" });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  markAsSold: async (req, res) => {
    try {
      const { isSold } = req.body;

      // If marking as sold, set deleteAt to 24 hours from now
      const deleteAt = isSold
        ? new Date(Date.now() + 24 * 60 * 60 * 1000)
        : null;
      const soldAt = isSold ? new Date() : null;

      const listing = await Listings.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        {
          isSold,
          deleteAt,
          soldAt,
        },
        { new: true }
      ).populate("user", "avatar username fullname");

      if (!listing)
        return res
          .status(400)
          .json({ msg: "Listing not found or unauthorized." });

      res.json({
        msg: isSold
          ? "Marked as Sold! It will be deleted in 24 hours."
          : "Marked as Available!",
        listing,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  getListing: async (req, res) => {
    try {
      const listing = await Listings.findById(req.params.id).populate(
        "user",
        "avatar username fullname"
      );

      if (!listing)
        return res.status(400).json({ msg: "Listing does not exist." });

      res.json({ listing });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = listingCtrl;
