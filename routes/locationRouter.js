const {
  shareLocation,
  getSharedLocations,
  stopSharing,
} = require("../controllers/locationCtrl");
const auth = require("../middleware/auth");

const router = express.Router();

// Share location
router.post("/share", auth, shareLocation);

// Get shared locations
router.get("/shared", auth, getSharedLocations);

// Stop sharing location
router.delete("/stop", auth, stopSharing);

module.exports = router;
