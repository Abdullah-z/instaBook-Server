const cron = require("node-cron");
const Listings = require("../models/listingModel");
const { sendPushNotification } = require("../socketServer");

const startAuctionScheduler = () => {
  // Run every minute to check for ended auctions
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      // Find auctions that have ended but haven't been completed yet
      const endedAuctions = await Listings.find({
        listingType: { $in: ["Bid", "Both"] },
        bidEndTime: { $lte: now },
        auctionCompleted: false,
        isSold: false,
      }).populate("highestBidder", "username fullname avatar");

      if (endedAuctions.length > 0) {
        console.log(
          `🏁 Found ${endedAuctions.length} ended auction(s) to process`
        );

        for (const listing of endedAuctions) {
          // If there's a highest bidder, mark as sold and notify them
          if (listing.highestBidder) {
            console.log(
              `   Processing: "${listing.name}" - Winner: ${listing.highestBidder.username}`
            );

            // Mark as sold and set deletion time
            await Listings.findByIdAndUpdate(listing._id, {
              isSold: true,
              soldAt: new Date(),
              deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
              auctionCompleted: true,
            });

            // Send push notification to the winner
            try {
              await sendPushNotification(
                listing.highestBidder._id.toString(),
                "🎉 You Won the Auction!",
                `Congratulations! You won "${listing.name}" with a bid of $${listing.currentBid}`,
                {
                  type: "AUCTION_WON",
                  listingId: listing._id.toString(),
                  listingName: listing.name,
                  winningBid: listing.currentBid,
                }
              );

              console.log(
                `   ✅ Winner notified for "${listing.name}" - Bid: $${listing.currentBid}`
              );
            } catch (error) {
              console.error(
                `   ❌ Failed to notify winner for "${listing.name}":`,
                error
              );
            }
          } else {
            // No bidders, just mark as completed
            await Listings.findByIdAndUpdate(listing._id, {
              auctionCompleted: true,
            });

            console.log(
              `   ⏭️ No bidders for "${listing.name}" - Marked as completed`
            );
          }
        }
      }
    } catch (err) {
      console.error("❌ Error in auction scheduler:", err);
    }
  });

  console.log("⏰ Auction scheduler started - Checking every minute");
};

module.exports = startAuctionScheduler;
