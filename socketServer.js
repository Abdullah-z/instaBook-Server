let users = [];
let admins = [];

const SocketServer = (socket) => {
  //#region //!Connection
  socket.on("joinUser", (id) => {
    // Remove any existing connections for this user
    users = users.filter((user) => user.id !== id);
    // Add the new connection
    users.push({ id, socketId: socket.id });
    console.log(`✅ User joined: ${id}, Total users: ${users.length}`);
    
    // Broadcast user online status to all connected clients
    socket.broadcast.emit("userOnlineStatusChanged", {
      userId: id,
      isOnline: true,
    });
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

  socket.on("addMessage", (msg) => {
    const user = users.find((user) => user.id === msg.recipient);
    user && socket.to(`${user.socketId}`).emit("addMessageToClient", msg);
  });

  //#endregion
};

module.exports = SocketServer;
