import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("https://frenzio-backend.onrender.com");

const peerConnections = {};
let localStream;
const GIPHY_KEY = "abc123xyz456";

const GIPHY_KEY = "abc123XYZ456pqrst";
export default function App() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [entered, setEntered] = useState(false);

  const [users, setUsers] = useState([]);

  // 🔥 LOAD CHAT HISTORY (LOCAL)
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("chat");
    return saved ? JSON.parse(saved) : [];
  });

  const [msg, setMsg] = useState("");

  const [speakingUsers, setSpeakingUsers] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // 🔥 EXTRA FEATURES
  const [typingUser, setTypingUser] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifResults, setGifResults] = useState([]);
  const [gifSearch, setGifSearch] = useState("");

  const chatRef = useRef(null);

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

    // 💬 CHAT
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
      }
    });

    socket.on("userList", setUsers);

    socket.on("speaking", ({ id, isSpeaking }) => {
      setSpeakingUsers((prev) => ({
        ...prev,
        [id]: isSpeaking,
      }));
    });

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

    const newMsg = {
      user: "Me",
      text,
      time: new Date().toLocaleTimeString(),
    };

    socket.emit("sendMessage", text);

    setMessages((p) => {
      const updated = [...p, newMsg];
      localStorage.setItem("chat", JSON.stringify(updated));
      return updated;
    });

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

  // EMOJI
  function addEmoji(e) {
    setMsg((prev) => prev + e);
  }

  // GIF SEARCH
  async function searchGif() {
    if (!gifSearch) return;

    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${gifSearch}&limit=12`,
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
    localStorage.removeItem("chat"); // optional
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
      <div className="voiceSection">
        <p>{room}</p>
        <p>{users.length} users</p>
        <p>{speakingCount} speaking</p>

        <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
        <button onClick={leaveRoom}>Leave</button>
      </div>

      <div className="chatSection">
        <div ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i}>
              <b>{m.user}</b> <small>{m.time}</small>
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

        {typingUser && <p>{typingUser} is typing...</p>}

        <input
          value={msg}
          onChange={handleTyping}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />

        <button onClick={() => send()}>Send</button>
        <button onClick={() => setShowEmoji(!showEmoji)}>😊</button>
        <button onClick={() => setShowGif(!showGif)}>GIF</button>

        {showEmoji &&
          ["😀", "😂", "😍", "🔥", "👍"].map((e, i) => (
            <span key={i} onClick={() => addEmoji(e)}>
              {e}
            </span>
          ))}

        {showGif && (
          <div>
            <input onChange={(e) => setGifSearch(e.target.value)} />
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
