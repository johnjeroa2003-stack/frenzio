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

  // ✅ NEW FEATURES
  const [typingUser, setTypingUser] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

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

    // 💬 MESSAGE RECEIVE (ENHANCED)
    socket.on("message", (data) => {
      if (data.type === "public") {
        const newMsg = {
          ...data,
          time: new Date().toLocaleTimeString(),
        };

        setMessages((p) => {
          const updated = [...p, newMsg];
          localStorage.setItem("chat", JSON.stringify(updated));
          return updated;
        });

        // 🔔 sound
        new Audio(
          "https://www.soundjay.com/buttons/sounds/button-3.mp3",
        ).play();
      }
    });

    socket.on("userList", setUsers);

    socket.on("speaking", ({ id, isSpeaking }) => {
      setSpeakingUsers((prev) => ({
        ...prev,
        [id]: isSpeaking,
      }));
    });

    // ✅ TYPING
    socket.on("typing", ({ user, isTyping }) => {
      setTypingUser(isTyping ? user : "");
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

  // 💾 LOAD SAVED CHAT
  useEffect(() => {
    const saved = localStorage.getItem("chat");
    if (saved) setMessages(JSON.parse(saved));
  }, []);

  // AUTO SCROLL
  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  // ENTER
  const enter = () => {
    if (!name || !room) return alert("Enter name & room");
    setEntered(true);
    socket.emit("join", { name, room });
  };

  // SEND (EDIT SUPPORT)
  const send = () => {
    if (!msg.trim()) return;

    if (editingIndex !== null) {
      const updated = [...messages];
      updated[editingIndex].text = msg;
      setMessages(updated);
      localStorage.setItem("chat", JSON.stringify(updated));
      setEditingIndex(null);
    } else {
      socket.emit("sendMessage", msg);

      const newMsg = {
        user: "Me",
        text: msg,
        time: new Date().toLocaleTimeString(),
      };

      setMessages((p) => {
        const updated = [...p, newMsg];
        localStorage.setItem("chat", JSON.stringify(updated));
        return updated;
      });
    }

    setMsg("");
  };

  // TYPING
  function handleTyping(e) {
    setMsg(e.target.value);

    socket.emit("typing", { user: name, isTyping: true });

    setTimeout(() => {
      socket.emit("typing", { user: name, isTyping: false });
    }, 1000);
  }

  // MUTE
  function toggleMute() {
    if (!localStream) return;

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isMuted;
    });

    setIsMuted(!isMuted);
  }

  function invite() {
    navigator.clipboard.writeText(window.location.href);
    alert("Invite link copied!");
  }

  function showPeople() {
    alert(users.map((u) => u.name).join("\n"));
  }

  function leaveRoom() {
    window.location.reload();
  }

  function openSettings() {
    alert("Settings coming soon ⚙");
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

      const audio = document.createElement("audio");
      audio.srcObject = stream;
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
    <div className="appContainer">
      {/* VOICE UI */}
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
          <button onClick={invite}>Invite</button>
          <button onClick={showPeople}>People</button>
          <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
          <button onClick={leaveRoom}>Leave</button>
          <button onClick={openSettings}>⚙</button>
        </div>
      </div>

      {/* CHAT */}
      <div className="chatSection">
        <div className="chatHeader">
          💬 Chat <span>{users.length} online</span>
        </div>

        <div className="chatMessages" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className="chatMsg">
              <b>{m.user}</b>
              <small style={{ marginLeft: 10 }}>{m.time}</small>

              <p>{m.text}</p>

              {m.user === "Me" && (
                <div>
                  <button
                    onClick={() => {
                      setMsg(m.text);
                      setEditingIndex(i);
                    }}
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => {
                      const updated = messages.filter(
                        (_, index) => index !== i,
                      );
                      setMessages(updated);
                      localStorage.setItem("chat", JSON.stringify(updated));
                    }}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {typingUser && <p>{typingUser} is typing...</p>}

        <div className="chatInput">
          <button onClick={() => setShowEmoji(!showEmoji)}>😊</button>

          <input
            value={msg}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />

          <button onClick={send}>Send</button>
        </div>

        {showEmoji && (
          <div>
            {["😀", "😂", "😍", "🔥", "👍"].map((e, i) => (
              <span key={i} onClick={() => setMsg((prev) => prev + e)}>
                {e}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
