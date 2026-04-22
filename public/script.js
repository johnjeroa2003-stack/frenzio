const socket = io();

let username, room;

function joinRoom() {
  username = document.getElementById("username").value;
  room = document.getElementById("room").value;

  document.getElementById("join-screen").classList.add("hidden");
  document.getElementById("chat-screen").classList.remove("hidden");

  document.getElementById("room-name").innerText = room;

  socket.emit("joinRoom", { username, room });
}

function sendMessage() {
  const msg = document.getElementById("msg").value;

  socket.emit("chatMessage", {
    room,
    message: msg,
    username,
  });

  addMessage(msg, "sent");
  document.getElementById("msg").value = "";
}

function addMessage(text, type) {
  const div = document.createElement("div");
  div.classList.add("message", type);
  div.innerText = text;

  document.getElementById("messages").appendChild(div);
}

socket.on("message", (msg) => {
  addMessage(msg, "received");
});

socket.on("roomUsers", (users) => {
  const ul = document.getElementById("users");
  ul.innerHTML = "";

  users.forEach((u) => {
    const li = document.createElement("li");
    li.innerText = u.username;
    ul.appendChild(li);
  });
});
