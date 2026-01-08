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
    origin: "*", // Allow all origins (or replace with your frontend URL later)
    credentials: true, // Allow cookies & Authorization headers
  })
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
      { upsert: true, new: true } // Create if doesn't exist, reuse if exists
    );

    console.log("🤖 AI Assistant ready.");
  })
  .catch((err) => console.log("DB Connection Error:", err));

// Start the auction scheduler
const startAuctionScheduler = require("./utils/auctionScheduler");
startAuctionScheduler();

// Scheduled Task: Cleanup Sold Listings (Every Minute)
const Listings = require("./models/listingModel");
const { deleteImageByUrl } = require("./utils/cloudinary");

setInterval(async () => {
  try {
    const expiredListings = await Listings.find({
      deleteAt: { $lte: new Date() },
    });

    if (expiredListings.length > 0) {
      console.log(
        `🧹 Found ${expiredListings.length} expired listings to cleanup.`
      );

      for (const listing of expiredListings) {
        console.log(`Processing listing: ${listing.name} (${listing._id})`);
        // Delete images from Cloudinary
        if (listing.images && listing.images.length > 0) {
          for (const imgUrl of listing.images) {
            await deleteImageByUrl(imgUrl);
          }
        }

        // Keep listing in DB but clear images and reset deleteAt
        await Listings.findByIdAndUpdate(listing._id, {
          images: [],
          deleteAt: null,
        });
        console.log(
          `✅ Cleaned up images for listing: ${listing.name} (${listing._id}). Record kept in DB.`
        );
      }
    }
  } catch (err) {
    console.error("Error in scheduled cleanup:", err);
  }
}, 60 * 1000); // Run every minute

// Start server
const port = process.env.PORT || 8080;
http.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
