const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../public")));

const users = new Map(); // socket.id -> { name, room }

io.on("connection", (socket) => {
  socket.on("join", ({ name, room }) => {
    users.set(socket.id, { name, room });

    socket.join(room);

    io.to(room).emit("userList", getUsers(room));
    socket.to(room).emit("user-joined", socket.id);
  });

  socket.on("sendMessage", (msg) => {
    const user = users.get(socket.id);
    if (!user) return;

    io.to(user.room).emit("message", {
      type: "public",
      user: user.name,
      text: msg,
    });
  });

  socket.on("privateMessage", ({ to, message }) => {
    const fromUser = users.get(socket.id);

    io.to(to).emit("privateMessage", {
      from: socket.id,
      name: fromUser.name,
      message,
    });
  });

  socket.on("speaking", (isSpeaking) => {
    const user = users.get(socket.id);
    if (!user) return;

    socket.to(user.room).emit("speaking", {
      id: socket.id,
      isSpeaking,
    });
  });

  // 🔥 WEBRTC
  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      io.to(user.room).emit("userList", getUsers(user.room));
    }
    users.delete(socket.id);
  });
});

function getUsers(room) {
  return Array.from(users.entries())
    .filter(([_, u]) => u.room === room)
    .map(([id, u]) => ({
      id,
      name: u.name,
    }));
}

// ✅ ONLY ONE ROOT ROUTE
app.get("/", (req, res) => {
  res.send("Frenzio Backend Running 🚀");
});

// ⚠️ IMPORTANT: use dynamic PORT for Render
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
