require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const SocketServer = require("./socketServer");

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
  })
  .then(() => console.log("Database Connected!!"))
  .catch((err) => console.log("DB Connection Error:", err));

// Start server
const port = process.env.PORT || 8080;
http.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
