const router = require("express").Router();
const listingCtrl = require("../controllers/listingController");
const auth = require("../middleware/auth");

router
  .route("/listings")
  .post(auth, listingCtrl.createListing)
  .get(auth, listingCtrl.getListings);

router.route("/listings/me").get(auth, listingCtrl.getMyListings);

router
  .route("/listings/:id")
  .get(auth, listingCtrl.getListing)
  .patch(auth, listingCtrl.updateListing)
  .delete(auth, listingCtrl.deleteListing);

router.patch("/listings/:id/sold", auth, listingCtrl.markAsSold);
router.patch("/listings/:id/bid", auth, listingCtrl.placeBid);

module.exports = router;
