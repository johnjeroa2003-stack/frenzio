import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("https://frenzio-backend.onrender.com");

const peerConnections = {};
const remoteAudios = {}; // 🔥 ADD THIS LINE
let localStream;

export default function App() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [entered, setEntered] = useState(false);

  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");

  const [speakingUsers, setSpeakingUsers] = useState({});
  const [isMuted, setIsMuted] = useState(false);

  const [volumeLevel, setVolumeLevel] = useState(0);

  // 🔥 NEW: GLOBAL ROOM LIST
  const [roomList, setRoomList] = useState([]);

  const chatRef = useRef(null);

  function getColor(name = "") {
    const colors = ["#00ff9d", "#00c3ff", "#ff7bff", "#ffd166", "#ff4d6d"];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  }

  const hostId = users[0]?.id;
  const speakingCount = Object.values(speakingUsers).filter(Boolean).length;

  // 🎤 INIT
  useEffect(() => {
    // 🎤 GET MICROPHONE
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      localStream = stream;

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      const mic = ctx.createMediaStreamSource(stream);
      mic.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      function detect() {
        analyser.getByteFrequencyData(data);
        const volume = data.reduce((a, b) => a + b) / data.length;

        setVolumeLevel(volume);
        socket.emit("speaking", volume > 20);

        requestAnimationFrame(detect);
      }

      detect();
    });

    // 💬 CHAT
    socket.on("message", (data) => {
      if (data.type === "public") {
        setMessages((p) => [...p, data]);
      }
    });

    // 👥 USER LIST + 🔥 CONNECT TO ALL USERS
    socket.on("userList", (userList) => {
      setUsers(userList);

      userList.forEach(async (u) => {
        if (u.id === socket.id) return;

        if (!peerConnections[u.id]) {
          const pc = createPeerConnection(u.id);

          localStream?.getAudioTracks().forEach((track) => {
            pc.addTrack(track, localStream);
          });

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("offer", { to: u.id, offer });
        }
      });
    });

    // 🎤 SPEAKING STATUS
    socket.on("speaking", ({ id, isSpeaking }) => {
      setSpeakingUsers((prev) => ({
        ...prev,
        [id]: isSpeaking,
      }));
    });

    // 🌐 ROOMS
    socket.on("roomList", (rooms) => {
      setRoomList(rooms);
    });

    // 🔁 AUTO RECONNECT
    socket.io.on("reconnect", () => {
      socket.emit("join", { name, room });
    });

    // 🎤 NEW USER JOINED
    socket.on("user-joined", async (id) => {
      if (id === socket.id) return;

      if (!peerConnections[id]) {
        const pc = createPeerConnection(id);

        localStream?.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", { to: id, offer });
      }
    });

    // 📡 RECEIVE OFFER
    socket.on("offer", async ({ from, offer }) => {
      const pc = createPeerConnection(from);

      await pc.setRemoteDescription(offer);

      localStream?.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", { to: from, answer });
    });

    // 📡 RECEIVE ANSWER
    socket.on("answer", ({ from, answer }) => {
      peerConnections[from]?.setRemoteDescription(answer);
    });

    // 📡 ICE
    socket.on("ice-candidate", ({ from, candidate }) => {
      peerConnections[from]?.addIceCandidate(candidate);
    });

    // 🧹 CLEANUP ON DISCONNECT
    socket.on("disconnect", () => {
      Object.values(peerConnections).forEach((pc) => pc.close());
      Object.values(remoteAudios).forEach((a) => a.remove());

      for (let key in peerConnections) delete peerConnections[key];
      for (let key in remoteAudios) delete remoteAudios[key];
    });

    // 🧹 CLEANUP ON RE-RENDER
    return () => {
      socket.off("message");
      socket.off("userList");
      socket.off("speaking");
      socket.off("roomList");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-joined");
      socket.off("disconnect");
    };
  }, [name, room]);

  // AUTO SCROLL
  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  // ENTER
  const enter = () => {
    if (!name || !room) return alert("Enter name & room");

    const ctx = new AudioContext();
    ctx.resume();

    // 🔥 ADD THIS BLOCK HERE
    document.body.addEventListener("click", () => {
      Object.values(remoteAudios).forEach((a) => {
        a.play().catch(() => {});
      });
    });

    setEntered(true);
    socket.emit("join", { name, room });
  };

  // SEND
  const send = () => {
    if (!msg.trim()) return;

    socket.emit("sendMessage", msg);
    setMessages((p) => [...p, { user: "Me", text: msg }]);
    setMsg("");
  };

  function toggleMute() {
    if (!localStream) return;

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });

    setIsMuted(!isMuted);
  }

  function invite() {
    try {
      navigator.clipboard.writeText(window.location.href);
      alert("Invite link copied!");
    } catch {
      prompt("Copy link:", window.location.href);
    }
  }

  function showPeople() {
    alert(users.map((u) => u.name).join("\n"));
  }

  function leaveRoom() {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    window.location.reload();
  }

  function openSettings() {
    alert("Settings coming soon ⚙");
  }

  function createPeerConnection(id) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },

        {
          urls: "turn:relay1.expressturn.com:3478",
          username: "ef3ZK9K7T4",
          credential: "9z3kfj29",
        },
      ],
    });

    peerConnections[id] = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          to: id,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      console.log("TRACK RECEIVED", stream);

      // 🔥 ADD THIS BLOCK (audio playback fix)
      if (!remoteAudios[id]) {
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.controls = false;

        document.body.appendChild(audio);

        audio.onloadedmetadata = () => {
          audio.play().catch(() => {});
        };

        remoteAudios[id] = audio;
      }

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);

      const panner = ctx.createStereoPanner();
      const gain = ctx.createGain();

      const userIndex = users.findIndex((u) => u.id === id);
      const total = users.length > 1 ? users.length : 2;

      let pan = (userIndex / (total - 1)) * 2 - 1;
      panner.pan.value = pan;

      const distanceFromCenter = Math.abs(userIndex - total / 2);
      gain.gain.value = 1 - distanceFromCenter / total;

      source.connect(panner);
      panner.connect(gain);
      gain.connect(ctx.destination);
    };

    return pc;
  }

  const getAvatar = (name) =>
    `https://api.dicebear.com/7.x/initials/svg?seed=${name}`;

  // 🔥 LOGIN SCREEN WITH ROOMS
  if (!entered) {
    return (
      <div className="login">
        <div className="card">
          <h1>Free Frenzio</h1>

          <input placeholder="Name" onChange={(e) => setName(e.target.value)} />

          <input
            placeholder="Room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />

          <button onClick={enter}>Enter</button>

          {/* 🔥 GLOBAL ROOM LIST UI */}
          <div style={{ marginTop: 20 }}>
            <h3>Live Rooms</h3>

            {roomList.length === 0 && <p>No active rooms</p>}

            {roomList.map((r, i) => (
              <div
                key={i}
                onClick={() => setRoom(r)}
                style={{
                  padding: "8px",
                  background: "#222",
                  margin: "5px 0",
                  cursor: "pointer",
                }}
              >
                {r}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appContainer">
      <div className="voiceSection">
        <div className="topBar">
          <div className="logo">
            Free <span>Frenzio</span>
          </div>
          <div className="badges">
            <span>🟢 {room}</span>
            <span>👥 {users.length}</span>
          </div>
        </div>

        <div className="circleArea">
          <div
            className="centerPulse"
            style={{ transform: `scale(${1 + volumeLevel / 200})` }}
          >
            <div
              className="wave"
              style={{ boxShadow: `0 0 ${20 + volumeLevel}px #00ff9d` }}
            ></div>
            <p>{speakingCount} speaking</p>
          </div>

          {users.map((u, i) => {
            const angle = i * (360 / users.length);
            const color = getColor(u.name);
            const isHost = u.id === hostId;

            return (
              <div
                key={u.id}
                className={`userBubble ${speakingUsers[u.id] ? "active" : ""}`}
                style={{
                  transform: `rotate(${angle}deg) translate(230px) rotate(-${angle}deg)`,
                }}
              >
                <div className="avatarWrap" style={{ "--glow": color }}>
                  <img src={getAvatar(u.name)} />
                  {isHost && <span className="hostBadge">★</span>}
                  <span className="mic">{isMuted ? "🔇" : "🎤"}</span>
                  <span className="ring r1"></span>
                  <span className="ring r2"></span>
                </div>
                <p className="username">{u.name}</p>
              </div>
            );
          })}
        </div>

        <div className="controls">
          <button className="btn" onClick={invite}>
            Invite
          </button>
          <button className="btn" onClick={showPeople}>
            People
          </button>
          <button className="muteBtn" onClick={toggleMute}>
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button className="btn leave" onClick={leaveRoom}>
            Leave
          </button>
          <button className="btn" onClick={openSettings}>
            ⚙
          </button>
        </div>
      </div>

      <div className="chatSection">
        <div className="chatHeader">
          💬 Chat <span>{users.length} online</span>
        </div>

        <div className="chatMessages" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className="chatMsg">
              <b>{m.user}</b>
              <p>{m.text}</p>
            </div>
          ))}
        </div>

        <div className="chatInput">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type message..."
          />
          <button onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
