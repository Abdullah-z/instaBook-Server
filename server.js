require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { SocketServer, sendPushNotification } = require("./socketServer");

const app = express();
app.use(express.json());
app.use(cookieParser());

// CORS for normal HTTP API requests
app.use(
  cors({
    origin: (origin, callback) => callback(null, true), // Allow all origins dynamically to support credentials
    credentials: true, // Allow cookies & Authorization headers
  }),
);

// Socket.IO with proper CORS (THIS IS THE CRITICAL FIX)
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*", // Allow your frontend (localhost:3000 + future domain)
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket connection
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id); // You’ll see this in Railway logs
  SocketServer(socket);
});

// Routes
app.use("/api", require("./routes/authRouter"));
app.use("/api", require("./routes/userRouter"));
app.use("/api", require("./routes/postRouter"));
app.use("/api", require("./routes/commentRouter"));
app.use("/api", require("./routes/adminRouter"));
app.use("/api", require("./routes/notifyRouter"));
app.use("/api", require("./routes/messageRouter"));
app.use("/api", require("./routes/agoraRouter"));
app.use("/api", require("./routes/listingRouter"));
app.use("/api", require("./routes/eventRouter"));
app.use("/api/location", require("./routes/locationRouter")); // New location route

// MongoDB Connection
const URI = process.env.MONGODB_URL;
mongoose
  .connect(URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
  .then(async () => {
    console.log("Database Connected!!");
    // Seed AI Assistant with STABLE ID
    const Users = require("./models/userModel");
    const bcrypt = require("bcrypt");

    const hashedPassword = await bcrypt.hash("ai_assistant_secure_pass", 12);

    // Use findOneAndUpdate to ensure we ALWAYS use the same AI user ID
    await Users.findOneAndUpdate(
      { email: "ai@instabook.com" }, // Find by unique email
      {
        fullname: "AI Assistant ✨",
        username: "ai_assistant",
        email: "ai@instabook.com",
        password: hashedPassword,
        role: "ai_assistant",
        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
      },
      { upsert: true, new: true }, // Create if doesn't exist, reuse if exists
    );

    console.log("🤖 AI Assistant ready.");
  })
  .catch((err) => console.log("DB Connection Error:", err));

// Start the auction scheduler
const startAuctionScheduler = require("./utils/auctionScheduler");
startAuctionScheduler();

// Start the reminder scheduler
const startReminderScheduler = require("./utils/reminderScheduler");
startReminderScheduler();

/*
// Scheduled Task: Cleanup Sold Listings (Every Minute)
const Listings = require("./models/listingModel");
const { deleteImageByUrl, deleteImage } = require("./utils/cloudinary");

setInterval(async () => {
  try {
    const expiredListings = await Listings.find({
      deleteAt: { $lte: new Date() },
    });

    if (expiredListings.length > 0) {
      console.log(
        `🧹 Found ${expiredListings.length} expired listings to cleanup.`,
      );

      for (const listing of expiredListings) {
        console.log(`Processing listing: ${listing.name} (${listing._id})`);
        // Delete images from Cloudinary
        if (listing.images && listing.images.length > 0) {
          for (const media of listing.images) {
            if (media.public_id) {
              await deleteImage(
                media.public_id,
                media.resource_type || "image",
              );
            } else {
              await deleteImageByUrl(media);
            }
          }
        }

        // Keep listing in DB but clear images and reset deleteAt
        await Listings.findByIdAndUpdate(listing._id, {
          images: [],
          deleteAt: null,
        });
        console.log(
          `✅ Cleaned up images for listing: ${listing.name} (${listing._id}). Record kept in DB.`,
        );
      }
    }
  } catch (err) {
    console.error("Error in scheduled cleanup:", err);
  }
}, 60 * 1000); // Run every minute
*/

// Scheduled Task: Cleanup Expired Stories (Every Minute)
const Posts = require("./models/postModel");
const { deleteImageByUrl, deleteImage } = require("./utils/cloudinary");
setInterval(async () => {
  try {
    const expiredStories = await Posts.find({
      isStory: true,
      expiresAt: { $lte: new Date() },
    });

    if (expiredStories.length > 0) {
      console.log(`Found ${expiredStories.length} expired stories to cleanup.`);

      for (const story of expiredStories) {
        console.log(`Processing story: ${story._id}`);
        // Delete images/videos from Cloudinary
        if (story.images && story.images.length > 0) {
          for (const media of story.images) {
            if (media.public_id) {
              await deleteImage(
                media.public_id,
                media.resource_type || "image",
              );
            } else if (typeof media === "string") {
              await deleteImageByUrl(media);
            } else if (media.url) {
              await deleteImageByUrl(media.url);
            }
          }
        }

        // Delete story from DB completely since it's a social post, not a marketplace listing
        await Posts.findByIdAndDelete(story._id);
        console.log(`Deleted expired story and its media: ${story._id}`);
      }
    }
  } catch (err) {
    console.error("Error in story scheduled cleanup:", err);
  }
}, 60 * 1000); // Run every minute

/*
// Scheduled Task: Cleanup Expired Events (Every Minute)
const Events = require("./models/eventModel");
setInterval(async () => {
  try {
    const expiredEvents = await Events.find({
      deleteAt: { $lte: new Date() },
      image: { $ne: "" }, // Only if image exists
    });

    if (expiredEvents.length > 0) {
      console.log(
        `🧹 Found ${expiredEvents.length} expired events to cleanup.`,
      );

      for (const event of expiredEvents) {
        console.log(`Processing event: ${event.title} (${event._id})`);
        // Delete image from Cloudinary
        if (event.image) {
          await deleteImageByUrl(event.image);
        }

        // Clear image and reset deleteAt
        await Events.findByIdAndUpdate(event._id, {
          image: "",
          deleteAt: null,
        });
        console.log(
          `✅ Cleaned up image for event: ${event.title} (${event._id}).`,
        );
      }
    }
  } catch (err) {
    console.error("Error in event scheduled cleanup:", err);
  }
}, 60 * 1000); // Run every minute
*/

// Start server
const port = process.env.PORT || 8080;
http.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
