const express = require("express");
const {
  shareLocation,
  getSharedLocations,
} = require("../controllers/locationCtrl");
const auth = require("../middleware/auth");

const router = express.Router();

// Share location
router.post("/share", auth, shareLocation);

// Get shared locations
router.get("/shared", auth, getSharedLocations);

module.exports = router;
