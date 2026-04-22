const socket = io();

let myId;
let currentDM = null;

function enterApp() {
  const name = document.getElementById("nameInput").value;

  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  socket.emit("join", name);
}

function send() {
  const input = document.getElementById("msgInput");

  socket.emit("sendMessage", input.value);
  addMsg(input.value, true);

  input.value = "";
}

socket.on("message", (data) => {
  if (data.type === "public") {
    addMsg(`${data.user}: ${data.text}`);
  }
});

function addMsg(text, self = false) {
  const div = document.createElement("div");
  div.className = "msg " + (self ? "self" : "");
  div.innerText = text;

  document.getElementById("chat").appendChild(div);
}

socket.on("userList", (users) => {
  const ul = document.getElementById("users");
  ul.innerHTML = "";

  users.forEach((u) => {
    const li = document.createElement("li");
    li.innerText = u.name;

    li.onclick = () => openDM(u);

    ul.appendChild(li);
  });
});

/* DM SYSTEM */
function openDM(user) {
  currentDM = user.id;

  document.getElementById("dmModal").classList.remove("hidden");
  document.getElementById("dmTitle").innerText = user.name;
}

function sendDM() {
  const input = document.getElementById("dmInput");

  socket.emit("privateMessage", {
    to: currentDM,
    message: input.value,
  });

  input.value = "";
}

socket.on("privateMessage", (data) => {
  document.getElementById("dmModal").classList.remove("hidden");
  document.getElementById("dmTitle").innerText = data.name;

  const div = document.createElement("div");
  div.innerText = data.message;

  document.getElementById("dmChat").appendChild(div);
});
