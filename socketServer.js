const { Expo } = require("expo-server-sdk");
const Users = require("./models/userModel");
const Conversations = require("./models/conversationModel");

let users = [];
let admins = [];

const expo = new Expo();

const sendPushNotification = async (targetUserId, title, body, data) => {
  try {
    const user = await Users.findById(targetUserId);
    if (!user || !user.pushToken) {
      console.log(
        `⚠️ Push failed: User ${targetUserId} not found or has no token`
      );
      return;
    }

    console.log(
      `🚀 Preparing push for ${user.username}, Token: ${user.pushToken}`
    );

    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.error(
        `❌ ERROR: Push token ${user.pushToken} is not a valid Expo push token for user ${user.username}`
      );
      return;
    }

    const messages = [
      {
        to: user.pushToken,
        sound: data.sound || "default",
        title,
        body,
        data,
        priority: "high",
        channelId: data.channelId || "default",
      },
    ];

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log(`✅ Push sent, tickets:`, ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("❌ Error sending push notification chunk", error);
      }
    }

    // Check receipts after 15 seconds
    if (tickets.length > 0) {
      setTimeout(async () => {
        try {
          const receiptIds = tickets
            .filter((ticket) => ticket.id)
            .map((ticket) => ticket.id);

          if (receiptIds.length > 0) {
            const receiptIdChunks =
              expo.chunkPushNotificationReceiptIds(receiptIds);
            for (const chunk of receiptIdChunks) {
              const receipts = await expo.getPushNotificationReceiptsAsync(
                chunk
              );
              console.log(
                "📬 Push receipts:",
                JSON.stringify(receipts, null, 2)
              );

              // Log any errors
              for (const receiptId in receipts) {
                const { status, message, details } = receipts[receiptId];
                if (status === "error") {
                  console.error(
                    `❌ Push failed for ${user.username}: ${message}`,
                    details
                  );
                }
              }
            }
          }
        } catch (error) {
          console.error("❌ Error checking push receipts:", error);
        }
      }, 15000);
    }
  } catch (error) {
    console.error("❌ CRITICAL ERROR in sendPushNotification:", error);
  }
};

const SocketServer = (socket) => {
  //#region //!Connection
  socket.on("joinUser", (id) => {
    // Remove any existing connections for this user
    users = users.filter((user) => user.id !== id);
    // Add the new connection
    users.push({ id, socketId: socket.id });
    console.log(`✅ User joined: ${id}, Total users: ${users.length}`);

    // Broadcast user online status to ALL connected clients (including the joining user)
    socket.emit("userOnlineStatusChanged", {
      userId: id,
      isOnline: true,
    });
    socket.broadcast.emit("userOnlineStatusChanged", {
      userId: id,
      isOnline: true,
    });

    // Send current list of online users to the newly connected user
    const onlineUserIds = users.map((user) => user.id);
    socket.emit("onlineUsersList", onlineUserIds);
  });

  socket.on("joinAdmin", (id) => {
    admins.push({ id, socketId: socket.id });
    const admin = admins.find((admin) => admin.id === id);
    let totalActiveUsers = users.length;

    socket.to(`${admin.socketId}`).emit("activeUsers", totalActiveUsers);
  });

  socket.on("disconnect", () => {
    const disconnectedUser = users.find((user) => user.socketId === socket.id);
    users = users.filter((user) => user.socketId !== socket.id);
    admins = admins.filter((user) => user.socketId !== socket.id);
    if (disconnectedUser) {
      console.log(
        `❌ User disconnected: ${disconnectedUser.id}, Total users: ${users.length}`
      );

      // Broadcast user offline status to all connected clients
      socket.broadcast.emit("userOnlineStatusChanged", {
        userId: disconnectedUser.id,
        isOnline: false,
      });
    }
  });

  //#endregion

  //#region //!Like
  socket.on("likePost", (newPost) => {
    let ids = [...newPost.user.followers, newPost.user._id];
    const clients = users.filter((user) => ids.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("likeToClient", newPost);
      });
    }
  });

  socket.on("unLikePost", (newPost) => {
    let ids = [...newPost.user.followers, newPost.user._id];
    const clients = users.filter((user) => ids.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("unLikeToClient", newPost);
      });
    }
  });
  //#endregion

  //#region //!comment
  socket.on("createComment", (newPost) => {
    let ids = [...newPost.user.followers, newPost.user._id];
    const clients = users.filter((user) => ids.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("createCommentToClient", newPost);
      });
    }
  });

  socket.on("deleteComment", (newPost) => {
    let ids = [...newPost.user.followers, newPost.user._id];
    const clients = users.filter((user) => ids.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("deleteCommentToClient", newPost);
      });
    }
  });
  //#endregion

  //#region //!follow

  socket.on("follow", (newUser) => {
    const user = users.find((user) => user.id === newUser._id);
    user && socket.to(`${user.socketId}`).emit("followToClient", newUser);
  });

  socket.on("unFollow", (newUser) => {
    const user = users.find((user) => user.id === newUser._id);
    user && socket.to(`${user.socketId}`).emit("unFollowToClient", newUser);
  });
  //#endregion

  //#region //!Notifications

  socket.on("createNotify", (msg) => {
    const clients = users.filter((user) => msg.recipients.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("createNotifyToClient", msg);
      });
    }
  });

  socket.on("removeNotify", (msg) => {
    const clients = users.filter((user) => msg.recipients.includes(user.id));
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("removeNotifyToClient", msg);
      });
    }
  });

  //#endregion

  socket.on("getActiveUsers", (id) => {
    const admin = admins.find((user) => user.id === id);
    const totalActiveUsers = users.length;

    socket
      .to(`${admin.socketId}`)
      .emit("getActiveUsersToClient", totalActiveUsers);
  });

  //#region //!Messages

  //#region //!Online Status
  socket.on("checkUserOnline", (id) => {
    const isOnline = users.some((user) => user.id === id);
    console.log(`🔍 Checking online status for ${id}: ${isOnline}`);
    socket.emit("checkUserOnlineToClient", { id, isOnline });
  });
  //#endregion

  //#region //!Call System
  socket.on("callUser", (data) => {
    console.log(`📞 Call request from ${data.from} to ${data.userToCall}`);
    const clients = users.filter((user) => user.id === data.userToCall);
    console.log(
      `   Found ${clients.length} client(s) for user ${data.userToCall}`
    );
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("callUserToClient", {
          signal: data.signalData,
          from: data.from,
          name: data.name,
        });
        console.log(`   ✅ Call signal sent to ${client.socketId}`);
      });
    }
  });

  socket.on("answerCall", (data) => {
    const clients = users.filter((user) => user.id === data.to);
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("callAccepted", data.signal);
      });
    }
  });

  socket.on("endCall", (data) => {
    const clients = users.filter((user) => user.id === data.to);
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("endCallToClient");
      });
    }
  });

  socket.on("iceCandidate", (data) => {
    console.log(`🧊 Forwarding ICE candidate to ${data.to}`);
    const clients = users.filter((user) => user.id === data.to);
    if (clients.length > 0) {
      clients.forEach((client) => {
        socket.to(`${client.socketId}`).emit("iceCandidate", data.candidate);
      });
    }
  });
  //#endregion

  // Voice Call Events
  socket.on("voiceCallInitiate", (data) => {
    console.log(
      `📞 Call initiated from ${data.callerName} to ${data.recipientName}`
    );
    const recipient = users.find((user) => user.id === data.recipientId);
    if (recipient) {
      socket.to(`${recipient.socketId}`).emit("voiceCallIncoming", {
        callerId: data.callerId,
        callerName: data.callerName,
        recipientId: data.recipientId,
        recipientName: data.recipientName,
        timestamp: data.timestamp,
        callerAvatar: data.callerAvatar,
        isVideo: data.isVideo,
      });
    }

    // Always attempt to send push notification for calls
    // (The client should handle deduplication if app is already open)
    sendPushNotification(
      data.recipientId,
      data.isVideo ? "Incoming Video Call" : "Incoming Call",
      `${data.callerName} is calling you...`,
      {
        type: "VOICE_CALL",
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        recipientId: data.recipientId,
        channelId: "voice_call",
        sound: "ringtone.mp3",
        isVideo: data.isVideo,
      }
    );

    console.log(
      `push sent for voice call to ${data.recipientId} with sound: ringtone.mp3`
    );
  });

  socket.on("voiceCallAccepted", (data) => {
    console.log(`✅ Call accepted by ${data.recipientId}`);
    const caller = users.find((user) => user.id === data.callerId);
    if (caller) {
      socket.to(`${caller.socketId}`).emit("voiceCallAccepted", {
        callerId: data.callerId,
        recipientId: data.recipientId,
        isVideo: data.isVideo,
      });
    }
  });

  socket.on("voiceCallRejected", (data) => {
    console.log(`❌ Call rejected by ${data.recipientId}`);
    const caller = users.find((user) => user.id === data.callerId);
    if (caller) {
      socket.to(`${caller.socketId}`).emit("voiceCallRejected", {
        callerId: data.callerId,
        recipientId: data.recipientId,
      });
    }
  });

  socket.on("voiceCallEnded", (data) => {
    console.log(
      `📵 Call ended between ${data.callerId} and ${data.recipientId}`
    );
    const recipient = users.find((user) => user.id === data.callerId);
    if (recipient) {
      socket.to(`${recipient.socketId}`).emit("voiceCallEnded", {
        callerId: data.callerId,
        recipientId: data.recipientId,
      });
    }
  });

  socket.on("addMessage", async (msg) => {
    try {
      if (msg.conversation) {
        // Group Chat: Fetch conversation to get recipients
        const conversation = await Conversations.findById(msg.conversation);
        if (conversation) {
          const recipients = conversation.recipients;
          recipients.forEach((recipientId) => {
            // Don't send back to sender
            if (recipientId.toString() === msg.sender._id.toString()) return;

            const user = users.find((u) => u.id === recipientId.toString());
            if (user) {
              socket.to(`${user.socketId}`).emit("addMessageToClient", msg);
            } else {
              // Push Notification for offline group members
              const messageText =
                msg.text ||
                (msg.media && msg.media.length > 0
                  ? "Sent a photo"
                  : "New message");

              sendPushNotification(
                recipientId.toString(),
                `${msg.sender.username} in ${
                  conversation.groupName || "Group"
                }`,
                messageText,
                {
                  type: "MESSAGE",
                  conversationId: msg.conversation,
                  senderId: msg.sender._id,
                }
              );
            }
          });
        }
      } else {
        // 1-on-1 Chat
        const user = users.find((user) => user.id === msg.recipient);
        if (user) {
          socket.to(`${user.socketId}`).emit("addMessageToClient", msg);
        } else {
          const messageText =
            msg.text ||
            (msg.media && msg.media.length > 0
              ? "Sent a photo"
              : "New message");

          sendPushNotification(
            msg.recipient,
            `New message from ${msg.sender.username}`,
            messageText,
            {
              type: "MESSAGE",
              conversationId: msg.conversation,
              senderId: msg.sender._id,
            }
          );
        }
      }
    } catch (err) {
      console.error("Socket addMessage Error:", err);
    }
  });

  //#endregion
};

module.exports = SocketServer;
