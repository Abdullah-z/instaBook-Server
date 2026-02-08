const Events = require("../models/eventModel");
const { deleteImageByUrl } = require("../utils/cloudinary");

const eventCtrl = {
  createEvent: async (req, res) => {
    try {
      const { title, description, date, time, image, address, location } =
        req.body;

      if (!title || !description || !date || !time || !address || !location) {
        return res
          .status(400)
          .json({ msg: "Please provide all required fields." });
      }

      // Set deleteAt to 24 hours after the event date
      const deleteAt = new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000);

      const newEvent = new Events({
        user: req.user._id,
        title,
        description,
        date,
        time,
        image,
        address,
        location,
        deleteAt,
      });

      await newEvent.save();

      res.json({
        msg: "Event created successfully!",
        newEvent: {
          ...newEvent._doc,
          user: req.user,
        },
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getEvents: async (req, res) => {
    try {
      const { lat, lon, radius } = req.query;

      const query = {
        date: { $gte: new Date().setHours(0, 0, 0, 0) },
      };

      const r = parseFloat(radius);
      if (lat && lon && r && r < 10000) {
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

      const events = await Events.find(query)
        .sort("date")
        .populate("user", "avatar username fullname");

      res.json({ events, result: events.length });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getEvent: async (req, res) => {
    try {
      const event = await Events.findById(req.params.id)
        .populate("user", "avatar username fullname")
        .populate("interested", "avatar username fullname")
        .populate("going", "avatar username fullname");

      if (!event) return res.status(400).json({ msg: "Event does not exist." });

      res.json({ event });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  updateEvent: async (req, res) => {
    try {
      const { title, description, date, time, image, address, location } =
        req.body;

      // Find existing event first
      const oldEvent = await Events.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!oldEvent)
        return res
          .status(400)
          .json({ msg: "Event not found or unauthorized." });

      // Calculate new deleteAt if date changed
      const deleteAt = date
        ? new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
        : oldEvent.deleteAt;

      // Delete old image if it was replaced
      if (image && oldEvent.image && image !== oldEvent.image) {
        await deleteImageByUrl(oldEvent.image);
      }

      const event = await Events.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { title, description, date, time, image, address, location, deleteAt },
        { new: true },
      ).populate("user", "avatar username fullname");

      res.json({ msg: "Update Success!", event });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  deleteEvent: async (req, res) => {
    try {
      const event = await Events.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id,
      });
      if (!event)
        return res
          .status(400)
          .json({ msg: "Event not found or unauthorized." });

      // Delete image from Cloudinary if exists
      if (event.image) {
        await deleteImageByUrl(event.image);
      }

      res.json({ msg: "Deleted Event!" });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  toggleInterested: async (req, res) => {
    try {
      const event = await Events.findById(req.params.id);
      if (!event) return res.status(400).json({ msg: "Event not found." });

      const isInterested = event.interested.includes(req.user._id);

      if (isInterested) {
        await Events.findOneAndUpdate(
          { _id: req.params.id },
          { $pull: { interested: req.user._id } },
        );
      } else {
        await Events.findOneAndUpdate(
          { _id: req.params.id },
          {
            $push: { interested: req.user._id },
            $pull: { going: req.user._id }, // Remove from going if they switch to interested
          },
        );
      }

      res.json({
        msg: isInterested ? "Unmarked interested." : "Marked interested!",
      });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  toggleGoing: async (req, res) => {
    try {
      const event = await Events.findById(req.params.id);
      if (!event) return res.status(400).json({ msg: "Event not found." });

      const isGoing = event.going.includes(req.user._id);

      if (isGoing) {
        await Events.findOneAndUpdate(
          { _id: req.params.id },
          { $pull: { going: req.user._id } },
        );
      } else {
        await Events.findOneAndUpdate(
          { _id: req.params.id },
          {
            $push: { going: req.user._id },
            $pull: { interested: req.user._id }, // Remove from interested if they switch to going
          },
        );
      }

      res.json({ msg: isGoing ? "Unmarked going." : "Marked going!" });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },

  getUserEvents: async (req, res) => {
    try {
      const events = await Events.find({ user: req.params.id }).sort("-date");
      res.json({ events, result: events.length });
    } catch (err) {
      return res.status(500).json({ msg: err.message });
    }
  },
};

module.exports = eventCtrl;
