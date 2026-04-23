import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("https://frenzio-backend.onrender.com");

const peerConnections = {};
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

  const chatRef = useRef(null);

  // 🎤 VOICE INIT
  useEffect(() => {
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

    socket.on("message", (data) => {
      if (data.type === "public") {
        setMessages((p) => [...p, data]);
      }
    });

    socket.on("userList", setUsers);

    socket.on("speaking", ({ id, isSpeaking }) => {
      setSpeakingUsers((prev) => ({ ...prev, [id]: isSpeaking }));
    });
  }, [name, room]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  const enter = () => {
    if (!name || !room) return alert("Enter name & room");
    setEntered(true);
    socket.emit("join", { name, room });
  };

  const send = () => {
    if (!msg.trim()) return;
    socket.emit("sendMessage", msg);
    setMessages((p) => [...p, { user: "Me", text: msg }]);
    setMsg("");
  };

  function toggleMute() {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted));
    setIsMuted(!isMuted);
  }

  function createPeerConnection(id) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnections[id] = pc;

    pc.ontrack = (e) => {
      const audio = document.createElement("audio");
      audio.srcObject = e.streams[0];
      audio.autoplay = true;
      document.body.appendChild(audio);
    };

    return pc;
  }

  if (!entered) {
    return (
      <div className="login">
        <div className="card">
          <h1>Free Frenzio</h1>
          <input placeholder="Name" onChange={(e) => setName(e.target.value)} />
          <input placeholder="Room" onChange={(e) => setRoom(e.target.value)} />
          <button onClick={enter}>Enter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mainLayout">
      {/* LEFT SIDEBAR */}
      <div className="sidebar">
        <h2>
          Free <span>Frenzio</span>
        </h2>

        <div className="menu">
          <div className="menuItem active">🏠 Home</div>
          <div className="menuItem">👥 People</div>
          <div className="menuItem">💬 Chat</div>
          <div className="menuItem">📁 Files</div>
          <div className="menuItem">⚙ Settings</div>
        </div>

        <div className="userCard">
          <p>{name}</p>
          <span>Online</span>
        </div>
      </div>

      {/* CENTER VOICE AREA */}
      <div className="voiceArea">
        <div className="top">
          <h3>{room}</h3>
          <span>{users.length} users</span>
        </div>

        <div className="circle">
          <div
            className="pulse"
            style={{ transform: `scale(${1 + volumeLevel / 200})` }}
          >
            🎤
          </div>
          <p>{Object.values(speakingUsers).filter(Boolean).length} speaking</p>
        </div>

        <div className="controls">
          <button>Invite</button>
          <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
          <button className="leave" onClick={() => window.location.reload()}>
            Leave
          </button>
        </div>
      </div>

      {/* RIGHT CHAT */}
      <div className="chatArea">
        <div className="chatHeader">Chat ({users.length})</div>

        <div className="messages" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.user === "Me" ? "me" : ""}`}>
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
