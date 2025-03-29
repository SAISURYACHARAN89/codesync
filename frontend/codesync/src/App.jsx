import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import MonacoEditor from "react-monaco-editor";

const socket = io("https://codesync-q15y.onrender.com", {
  withCredentials: true,
});

socket.on("connect", () => {
  console.log("Connected to server! Socket ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server!");
});

const App = () => {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Loading state
  const localVideoRef = useRef();
  const [peers, setPeers] = useState([]);
  const localStreamRef = useRef();
  const peerConnections = useRef({}); // Store active peer connections

  // Get user media and handle WebRTC connections
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("getUserMedia is not supported in this browser");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        console.log("Local stream obtained:", stream);
        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        socket.emit("ready"); // Notify server that user is ready
      })
      .catch((err) => console.error("Error accessing media devices:", err));

    // Handle user connections and signaling
    socket.on("user-connected", (userId) => {
      console.log("User connected:", userId);

      // Ensure the local stream is ready before creating a peer
      if (localStreamRef.current) {
        createPeer(userId, true);
      } else {
        console.warn("Stream not ready yet. Retrying when available...");
        const interval = setInterval(() => {
          if (localStreamRef.current) {
            createPeer(userId, true);
            clearInterval(interval);
          }
        }, 500);
      }
    });

    socket.on("signal", ({ userId, signal }) => {
      console.log("Received signal from user:", userId, signal);
      if (!peerConnections.current[userId]) {
        createPeer(userId, false); // Create peer connection if not exists
      }
      setTimeout(() => {
        console.log("Sending signal to peer:", userId, signal);
        peerConnections.current[userId]?.signal(signal); // Ensure peer is created before signaling
      }, 100);
    });

    socket.on("user-disconnected", (userId) => {
      console.log("User disconnected:", userId);
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].destroy();
        delete peerConnections.current[userId];
      }
      setPeers((prevPeers) => prevPeers.filter((p) => p.userId !== userId));
    });

    return () => {
      socket.off("user-connected");
      socket.off("signal");
      socket.off("user-disconnected");
    };
  }, []);

  // Create a new WebRTC peer connection
  const createPeer = (userId, initiator) => {
    if (!localStreamRef.current) {
      console.error("Local stream is not available!");
      return;
    }

    console.log("Creating peer for user:", userId, "Initiator:", initiator);
    console.log("Local stream:", localStreamRef.current);

    try {
      const peer = new SimplePeer({
        initiator,
        trickle: false,
        stream: localStreamRef.current,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      console.log("Peer created:", peer);

      peer.on("signal", (signal) => {
        console.log("Sending signal to user:", userId, signal);
        socket.emit("signal", { userId, signal });
      });

      peer.on("stream", (remoteStream) => {
        console.log("Received remote stream from user:", userId, remoteStream);
        setPeers((prevPeers) => [
          ...prevPeers.filter((p) => p.userId !== userId),
          { userId, stream: remoteStream },
        ]);
      });

      peer.on("close", () => {
        console.log("Peer connection closed:", userId);
        setPeers((prevPeers) => prevPeers.filter((p) => p.userId !== userId));
        delete peerConnections.current[userId];
      });

      peer.on("error", (err) => console.error("WebRTC error:", err));
      peer.on("iceStateChange", (state) => {
        console.log("ICE Connection State for user:", userId, state);
      });

      peerConnections.current[userId] = peer;
    } catch (err) {
      console.error("Error creating peer:", err);
    }
  };

  // Create a new room
  const handleCreateRoom = () => {
    socket.emit("create-room");
  };

  // Join an existing room
  const handleJoinRoom = () => {
    const roomId = prompt("Enter Room ID:");
    if (roomId) {
      socket.emit("join-room", roomId);
    }
  };

  // Listen for room creation and joining events
  useEffect(() => {
    socket.on("room-created", (roomId) => {
      setRoomId(roomId);
      alert(`Room created! Share this Code: ${roomId}`);
    });

    socket.on("room-joined", (roomId) => {
      setRoomId(roomId);
      alert(`Joined room: ${roomId}`);
    });

    socket.on("room-not-found", () => {
      alert("Room not found!");
    });

    return () => {
      socket.off("room-created");
      socket.off("room-joined");
      socket.off("room-not-found");
    };
  }, []);

  const handleRunCode = async () => {
    setIsLoading(true); // Set loading to true
    try {
      const response = await fetch(
        "https://codesync-q15y.onrender.com/run-code",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, language, roomId, input }), // Include input in the request
        }
      );
      const result = await response.json();
      setOutput(result.output); // Set the output
    } catch (err) {
      console.error("Error running code:", err);
      setOutput("Error: " + err.message); // Set error message
    } finally {
      setIsLoading(false); // Set loading to false
    }
  };

  // Listen for real-time code updates
  useEffect(() => {
    socket.on("code-update", (newCode) => {
      setCode(newCode);
    });

    return () => {
      socket.off("code-update");
    };
  }, []);

  // Listen for real-time output updates
  useEffect(() => {
    socket.on("output-update", (newOutput) => {
      setOutput(newOutput);
    });

    return () => {
      socket.off("output-update");
    };
  }, []);

  // Handle code changes
  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("code-change", newCode, roomId);
  };

  return (
    <div style={{ display: "flex", gap: "20px", padding: "20px" }}>
      <div style={{ flex: 1 }}>
        <h1>Collaborative Code Editor</h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <button onClick={handleCreateRoom}>Create Room</button>
          <button onClick={handleJoinRoom}>Join Room</button>
          {roomId && (
            <div style={{ marginLeft: "10px" }}>
              <p style={{ margin: 0 }}>Room ID: {roomId}</p>
            </div>
          )}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
          <button onClick={handleRunCode}>Run</button>
        </div>
        <MonacoEditor
          width="800"
          height="500"
          language={language}
          theme="vs-dark"
          value={code}
          onChange={handleCodeChange}
          options={{
            automaticLayout: true, // Automatically resize the editor
            fontSize: 14, // Set font size
            minimap: { enabled: false }, // Disable minimap
            scrollBeyondLastLine: false, // Disable scrolling beyond the last line
            wordWrap: "on", // Enable word wrap
            suggestOnTriggerCharacters: true, // Enable IntelliSense
            quickSuggestions: true, // Enable quick suggestions
          }}
        />
        <div style={{ marginTop: "10px" }}>
          <h3>
            Output:
            {isLoading && (
              <span style={{ marginLeft: "10px", color: "#888" }}>
                Loading...
              </span>
            )}
          </h3>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            {output}
          </pre>
        </div>
        <div style={{ marginTop: "10px" }}>
          <h3>Input:</h3>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              width: "100%",
              height: "100px",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #ccc",
              fontFamily: "monospace",
            }}
            placeholder="Enter custom input here..."
          />
        </div>
      </div>
      <div style={{ width: "300px" }}>
        <h2>Video Conference</h2>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          style={{ width: "100%", borderRadius: "5px", marginBottom: "10px" }}
        />
        {peers.map((peer) => (
          <video
            key={peer.userId}
            ref={(ref) => {
              if (ref && peer.stream) {
                ref.srcObject = peer.stream;
              }
            }}
            autoPlay
            playsInline
            style={{ width: "100%", borderRadius: "5px", marginBottom: "10px" }}
          />
        ))}
      </div>
    </div>
  );
};

export default App;
