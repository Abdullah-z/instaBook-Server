const router = require("express").Router();
const auth = require("../middleware/auth");
const userCtrl = require("../controllers/userCtrl");

router.get("/search", auth, userCtrl.searchUser);

router.get("/user/:id", auth, userCtrl.getUser);
router.get("/user_username/:username", auth, userCtrl.getUserByUsername);

router.patch("/user", auth, userCtrl.updateUser);

router.patch("/user/:id/follow", auth, userCtrl.follow);
router.patch("/user/:id/unfollow", auth, userCtrl.unfollow);
router.patch("/user/:id/accept_request", auth, userCtrl.acceptFollowRequest);
router.patch("/user/:id/reject_request", auth, userCtrl.rejectFollowRequest);

router.get("/suggestionsUser", auth, userCtrl.suggestionsUser);

router.post("/user/push_token", auth, userCtrl.savePushToken);
router.get("/ai_user", auth, userCtrl.getAIUser);

module.exports = router;
