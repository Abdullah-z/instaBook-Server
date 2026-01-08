const Listings = require("../models/listingModel");
const { sendPushNotification } = require("../socketServer");

const { deleteImageByUrl } = require("../utils/cloudinary");

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
        listingType,
        bidEndTime,
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
        listingType,
        bidEndTime,
        currentBid: 0,
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
      const listings = await Listings.find({
        images: { $exists: true, $not: { $size: 0 } }, // Only exclude when images are deleted
      })
        .sort("-createdAt")
        .populate("user", "avatar username fullname")
        .populate("highestBidder", "avatar username fullname");

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
        .populate("user", "avatar username fullname")
        .populate("highestBidder", "avatar username fullname");

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
        listingType,
        bidEndTime,
      } = req.body;

      // Find existing listing first
      const oldListing = await Listings.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!oldListing)
        return res
          .status(400)
          .json({ msg: "Listing not found or unauthorized." });

      // Find images that were removed
      const oldImages = oldListing.images || [];
      const newImages = images || [];
      const removedImages = oldImages.filter((img) => !newImages.includes(img));

      // Delete removed images from Cloudinary
      if (removedImages.length > 0) {
        for (const imgUrl of removedImages) {
          await deleteImageByUrl(imgUrl);
        }
      }

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
          listingType,
          bidEndTime,
        },
        { new: true }
      ).populate("user", "avatar username fullname");

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

      // Delete all images associated with this listing
      if (listing.images && listing.images.length > 0) {
        for (const imgUrl of listing.images) {
          await deleteImageByUrl(imgUrl);
        }
      }

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
      const listing = await Listings.findById(req.params.id)
        .populate("user", "avatar username fullname")
        .populate("highestBidder", "avatar username fullname");

      if (!listing)
        return res.status(400).json({ msg: "Listing does not exist." });

      res.json({ listing });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
  placeBid: async (req, res) => {
    try {
      const { amount } = req.body;
      const listing = await Listings.findById(req.params.id);

      if (!listing) return res.status(400).json({ msg: "Listing not found." });

      if (listing.isSold)
        return res.status(400).json({ msg: "Item already sold." });

      if (listing.listingType === "Sell")
        return res.status(400).json({ msg: "This item is not for bidding." });

      if (listing.bidEndTime && new Date(listing.bidEndTime) < new Date()) {
        return res.status(400).json({ msg: "Bidding has ended." });
      }

      if (amount <= listing.currentBid) {
        return res
          .status(400)
          .json({ msg: "Bid must be higher than the current bid." });
      }

      if (amount > listing.price) {
        return res
          .status(400)
          .json({ msg: "Bid cannot exceed the asking price." });
      }

      const updateData = {
        currentBid: amount,
        highestBidder: req.user._id,
        $push: { bidHistory: { user: req.user._id, amount, time: new Date() } },
      };

      // If bid matches asking price, mark as sold
      if (amount === listing.price) {
        updateData.isSold = true;
        updateData.soldAt = new Date();
        updateData.deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      const updatedListing = await Listings.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).populate("user highestBidder", "avatar username fullname");

      // Send push notifications to all previous bidders (except current bidder)
      if (listing.bidHistory && listing.bidHistory.length > 0) {
        // Extract unique bidder IDs (excluding the current bidder)
        const uniqueBidders = [
          ...new Set(
            listing.bidHistory
              .map((bid) => bid.user.toString())
              .filter((userId) => userId !== req.user._id.toString())
          ),
        ];

        // Send notification to each previous bidder
        for (const bidderId of uniqueBidders) {
          try {
            await sendPushNotification(
              bidderId,
              `New bid on "${listing.name}"`,
              `Someone just bid $${amount}. Current highest bid: $${updatedListing.currentBid}`,
              {
                type: "NEW_BID",
                listingId: listing._id.toString(),
                listingName: listing.name,
                newBid: amount,
                currentBid: updatedListing.currentBid,
              }
            );
          } catch (error) {
            console.error(
              `❌ Failed to send notification to bidder ${bidderId}:`,
              error
            );
          }
        }

        console.log(
          `📣 Sent bid notifications to ${uniqueBidders.length} previous bidder(s) for listing: ${listing.name}`
        );
      }

      res.json({
        msg:
          amount === listing.price
            ? "Congratulations! You've bought the item."
            : "Bid placed successfully!",
        listing: updatedListing,
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = listingCtrl;
