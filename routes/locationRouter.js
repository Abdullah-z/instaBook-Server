const express = require("express");
const {
  shareLocation,
  getSharedLocations,
  stopSharing,
  createShoutout,
} = require("../controllers/locationCtrl");
const auth = require("../middleware/auth");

const router = express.Router();

// Share location
router.post("/share", auth, shareLocation);

// Get shared locations
router.get("/shared", auth, getSharedLocations);

// Stop sharing location
router.delete("/stop", auth, stopSharing);

// Create shoutout (Digital Graffiti)
router.post("/shoutout", auth, createShoutout);

module.exports = router;
