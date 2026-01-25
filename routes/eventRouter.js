const router = require("express").Router();
const auth = require("../middleware/auth");
const eventCtrl = require("../controllers/eventCtrl");

router
  .route("/events")
  .get(auth, eventCtrl.getEvents)
  .post(auth, eventCtrl.createEvent);

router
  .route("/event/:id")
  .get(auth, eventCtrl.getEvent)
  .patch(auth, eventCtrl.updateEvent)
  .delete(auth, eventCtrl.deleteEvent);

router.patch("/event/:id/interested", auth, eventCtrl.toggleInterested);
router.patch("/event/:id/going", auth, eventCtrl.toggleGoing);

module.exports = router;
