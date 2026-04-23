import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

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

  // 🔥 ADDED STATES (PRO FEATURES)
  const [typing, setTyping] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const [onlineStatus, setOnlineStatus] = useState({});

  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifResults, setGifResults] = useState([]);
  const [gifSearch, setGifSearch] = useState("");

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
      setSpeakingUsers((prev) => ({
        ...prev,
        [id]: isSpeaking,
      }));
    });

    // 🔥 RECEIVE TYPING
    socket.on("typing", ({ user, isTyping }) => {
      setTypingUser(isTyping ? user : "");
    });

    // 🔥 ONLINE STATUS
    socket.on("status", ({ id, online }) => {
      setOnlineStatus((prev) => ({
        ...prev,
        [id]: online,
      }));
    });

    socket.io.on("reconnect", () => {
      socket.emit("join", { name, room });
    });

    // 🎤 VOICE
    socket.on("user-joined", async (id) => {
      const pc = createPeerConnection(id);

      localStream?.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("offer", { to: id, offer });
    });

    socket.on("offer", async ({ from, offer }) => {
      const pc = createPeerConnection(from);

      await pc.setRemoteDescription(offer);

      localStream?.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", { to: from, answer });
    });

    socket.on("answer", ({ from, answer }) => {
      peerConnections[from]?.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", ({ from, candidate }) => {
      peerConnections[from]?.addIceCandidate(candidate);
    });
  }, [name, room]);

  // AUTO SCROLL
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ENTER
  const enter = () => {
    if (!name || !room) return alert("Enter name & room");
    setEntered(true);
    socket.emit("join", { name, room });
  };

  // SEND
  const send = (custom = null) => {
    const text = custom || msg;
    if (!text.trim()) return;

    socket.emit("sendMessage", text);
    setMessages((p) => [...p, { user: "Me", text }]);
    setMsg("");
  };

  // EMOJI
  function addEmoji(e) {
    setMsg((prev) => prev + e);
  }

  // GIF SEARCH
  async function searchGif() {
    if (!gifSearch) return;

    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=YOUR_GIPHY_API_KEY&q=${gifSearch}&limit=12`,
    );

    const data = await res.json();
    setGifResults(data.data);
  }

  function sendGif(url) {
    send(`GIF:${url}`);
    setShowGif(false);
  }

  // MUTE
  function toggleMute() {
    if (!localStream) return;

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });

    setIsMuted(!isMuted);
  }

  function leaveRoom() {
    window.location.reload();
  }

  function createPeerConnection(id) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
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
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(ctx.destination);
    };

    return pc;
  }

  const getAvatar = (name) =>
    `https://api.dicebear.com/7.x/initials/svg?seed=${name}`;

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
            <p>{speakingCount} speaking</p>
          </div>
        </div>

        <div className="controls">
          <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
          <button onClick={leaveRoom}>Leave</button>
        </div>
      </div>

      <div className="chatSection">
        <div className="chatMessages" ref={chatRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                background: m.user === "Me" ? "#005c4b" : "#222",
                padding: 8,
                borderRadius: 10,
                margin: 5,
                maxWidth: "70%",
              }}
            >
              <b>{m.user}</b>

              {/* 🕒 TIME */}
              {m.time && (
                <small style={{ fontSize: 10, opacity: 0.6 }}>{m.time}</small>
              )}

              {m.text.startsWith("GIF:") ? (
                <img src={m.text.replace("GIF:", "")} width={150} />
              ) : m.text.startsWith("http") ? (
                <a href={m.text} target="_blank">
                  {m.text}
                </a>
              ) : (
                <p>{m.text}</p>
              )}
            </div>
          ))}
        </div>

        {/* 🔥 REAL TYPING */}
        {typingUser && (
          <p style={{ fontSize: 12 }}>{typingUser} is typing...</p>
        )}

        <div className="chatInput">
          <input
            value={msg}
            onChange={(e) => {
              setMsg(e.target.value);

              socket.emit("typing", true);
              setTimeout(() => {
                socket.emit("typing", false);
              }, 1000);
            }}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />

          <button onClick={() => send()}>Send</button>
          <button onClick={() => setShowEmoji(!showEmoji)}>😊</button>
          <button onClick={() => setShowGif(!showGif)}>GIF</button>
        </div>

        {showEmoji && (
          <div>
            {["😀", "😂", "😍", "🔥", "👍", "😎", "😭"].map((e, i) => (
              <span key={i} onClick={() => addEmoji(e)}>
                {e}
              </span>
            ))}
          </div>
        )}

        {showGif && (
          <div>
            <input
              value={gifSearch}
              onChange={(e) => setGifSearch(e.target.value)}
            />
            <button onClick={searchGif}>Search</button>

            {gifResults.map((g) => (
              <img
                key={g.id}
                src={g.images.fixed_height.url}
                width={100}
                onClick={() => sendGif(g.images.fixed_height.url)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
