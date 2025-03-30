import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import MonacoEditor from "react-monaco-editor";
import { Buffer } from "buffer";

// Polyfill for browser
window.Buffer = Buffer;

const App = () => {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [cursorPositions, setCursorPositions] = useState({});
  const [mediaError, setMediaError] = useState(null);

  const localVideoRef = useRef();
  const [peers, setPeers] = useState([]);
  const localStreamRef = useRef();
  const peerConnections = useRef({});
  const socketRef = useRef();
  const editorRef = useRef();

  // Initialize socket connection
  useEffect(() => {
    const socket = io("https://codesync-q15y.onrender.com", {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server! Socket ID:", socket.id);
      setConnectionStatus("connected");
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
      setConnectionStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setConnectionStatus("error");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Get user media and handle WebRTC
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const cleanupMedia = async () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };

    const setupMedia = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia not supported in this browser");
        }

        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;
        setMediaError(null);

        if (socket.connected) {
          socket.emit("ready");
        }
      } catch (err) {
        console.error("Media error:", err);
        setMediaError(err.message);
      }
    };

    setupMedia();

    const handleUserConnected = (userId) => {
      console.log("New user connected:", userId);
      if (localStreamRef.current) {
        createPeer(userId, true);
      } else {
        console.warn("Local stream not ready for new peer");
      }
    };

    const handleSignal = ({ userId, signal }) => {
      console.log("Received signal from:", userId);
      if (!peerConnections.current[userId]) {
        createPeer(userId, false);
      }

      // Small delay to ensure peer is properly initialized
      setTimeout(() => {
        if (peerConnections.current[userId]) {
          peerConnections.current[userId].signal(signal);
        }
      }, 100);
    };

    const handleUserDisconnected = (userId) => {
      console.log("User disconnected:", userId);
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].destroy();
        delete peerConnections.current[userId];
        setPeers((prev) => prev.filter((p) => p.userId !== userId));
      }
    };

    socket.on("user-connected", handleUserConnected);
    socket.on("signal", handleSignal);
    socket.on("user-disconnected", handleUserDisconnected);

    return () => {
      cleanupMedia();
      socket.off("user-connected", handleUserConnected);
      socket.off("signal", handleSignal);
      socket.off("user-disconnected", handleUserDisconnected);

      // Clean up all peer connections
      Object.values(peerConnections.current).forEach((peer) => {
        try {
          peer.destroy();
        } catch (err) {
          console.error("Error destroying peer:", err);
        }
      });
      peerConnections.current = {};
      setPeers([]);
    };
  }, []);

  // Room management
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomCreated = (id) => {
      console.log("Room created:", id);
      setRoomId(id);
      alert(`Room created! Share this code: ${id}`);
    };

    const handleRoomJoined = (id) => {
      console.log("Joined room:", id);
      setRoomId(id);
      alert(`Joined room: ${id}`);
    };

    const handleRoomNotFound = () => {
      console.log("Room not found");
      alert("Room not found!");
    };

    socket.on("room-created", handleRoomCreated);
    socket.on("room-joined", handleRoomJoined);
    socket.on("room-not-found", handleRoomNotFound);

    return () => {
      socket.off("room-created", handleRoomCreated);
      socket.off("room-joined", handleRoomJoined);
      socket.off("room-not-found", handleRoomNotFound);
    };
  }, []);

  // Code and cursor sync
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleCodeUpdate = (newCode) => {
      if (newCode !== code) {
        setCode(newCode);
      }
    };

    const handleCursorUpdate = ({ userId, cursorPosition }) => {
      setCursorPositions((prev) => ({
        ...prev,
        [userId]: cursorPosition,
      }));
    };

    const handleOutputUpdate = (newOutput) => {
      setOutput(newOutput);
    };

    socket.on("code-update", handleCodeUpdate);
    socket.on("cursor-update", handleCursorUpdate);
    socket.on("output-update", handleOutputUpdate);

    return () => {
      socket.off("code-update", handleCodeUpdate);
      socket.off("cursor-update", handleCursorUpdate);
      socket.off("output-update", handleOutputUpdate);
    };
  }, [code]);

  const createPeer = (userId, initiator) => {
    if (!localStreamRef.current) {
      console.error("Cannot create peer: local stream not available");
      return;
    }

    try {
      console.log(
        `Creating ${initiator ? "initiator" : "receiver"} peer for:`,
        userId
      );

      const peer = new SimplePeer({
        initiator,
        trickle: false,
        stream: localStreamRef.current,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
        objectMode: false,
      });

      peer.on("signal", (signal) => {
        console.log("Sending signal to:", userId);
        socketRef.current.emit("signal", { userId, signal });
      });

      peer.on("stream", (stream) => {
        console.log("Received stream from:", userId);
        setPeers((prev) => [
          ...prev.filter((p) => p.userId !== userId),
          { userId, stream },
        ]);
      });

      peer.on("close", () => {
        console.log("Peer connection closed:", userId);
        setPeers((prev) => prev.filter((p) => p.userId !== userId));
        delete peerConnections.current[userId];
      });

      peer.on("error", (err) => {
        console.error("Peer error:", userId, err);
      });

      peerConnections.current[userId] = peer;
    } catch (err) {
      console.error("Peer creation error:", err);
    }
  };

  const handleCreateRoom = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("create-room");
    } else {
      alert("Not connected to server. Please wait...");
    }
  };

  const handleJoinRoom = () => {
    const id = prompt("Enter Room ID:");
    if (id && socketRef.current?.connected) {
      socketRef.current.emit("join-room", id.trim());
    } else if (!socketRef.current?.connected) {
      alert("Not connected to server. Please wait...");
    }
  };

  const handleRunCode = async () => {
    if (!code.trim()) return;
    if (!socketRef.current?.connected) {
      alert("Not connected to server. Please wait...");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        "https://codesync-q15y.onrender.com/run-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, language, roomId, input }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Request failed");
      }

      const result = await response.json();
      setOutput(result.output);
    } catch (err) {
      console.error("Execution error:", err);
      setOutput(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit("code-change", newCode, roomId);
    }
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition((e) => {
      if (socketRef.current?.connected && roomId) {
        socketRef.current.emit(
          "cursor-update",
          {
            cursorPosition: e.position,
          },
          roomId
        );
      }
    });
  };

  const retryMedia = async () => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;
      setMediaError(null);

      if (socketRef.current?.connected) {
        socketRef.current.emit("ready");
      }
    } catch (err) {
      console.error("Media retry error:", err);
      setMediaError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", gap: "20px", padding: "20px" }}>
      {/* Left side - Editor */}
      <div style={{ flex: 1 }}>
        <h1>Collaborative Code Editor</h1>
        <div
          style={{
            marginBottom: "10px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <span>
            Status:
            <span
              style={{
                color:
                  connectionStatus === "connected"
                    ? "green"
                    : connectionStatus === "error"
                    ? "red"
                    : "orange",
                marginLeft: "5px",
              }}
            >
              {connectionStatus}
            </span>
          </span>
          <button
            onClick={handleCreateRoom}
            disabled={!socketRef.current?.connected}
          >
            Create Room
          </button>
          <button
            onClick={handleJoinRoom}
            disabled={!socketRef.current?.connected}
          >
            Join Room
          </button>
          {roomId && <span>Room: {roomId}</span>}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
          <button
            onClick={handleRunCode}
            disabled={isLoading || !socketRef.current?.connected}
          >
            {isLoading ? "Running..." : "Run"}
          </button>
        </div>

        <MonacoEditor
          width="800"
          height="500"
          language={language}
          theme="vs-dark"
          value={code}
          onChange={handleCodeChange}
          editorDidMount={handleEditorMount}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
        />

        <div style={{ marginTop: "20px" }}>
          <h3>Input</h3>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: "100%", height: "80px", padding: "8px" }}
            placeholder="Enter input for your code here..."
          />

          <h3>Output {isLoading && "(Running...)"}</h3>
          <pre
            style={{
              background: "#f0f0f0",
              padding: "10px",
              whiteSpace: "pre-wrap",
              maxHeight: "200px",
              overflow: "auto",
            }}
          >
            {output || "No output yet"}
          </pre>
        </div>
      </div>

      {/* Right side - Video */}
      <div style={{ width: "300px" }}>
        <h2>Video Conference</h2>
        {mediaError && (
          <div style={{ color: "red", marginBottom: "10px" }}>
            <p>Media Error: {mediaError}</p>
            <button onClick={retryMedia}>Retry Camera/Mic</button>
          </div>
        )}
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            marginBottom: "10px",
            backgroundColor: "#000",
            aspectRatio: "4/3",
          }}
        />
        {peers.length > 0 ? (
          peers.map((peer) => (
            <video
              key={peer.userId}
              ref={(ref) => ref && (ref.srcObject = peer.stream)}
              autoPlay
              playsInline
              style={{
                width: "100%",
                marginBottom: "10px",
                backgroundColor: "#000",
                aspectRatio: "4/3",
              }}
            />
          ))
        ) : (
          <p>No other participants in room</p>
        )}
      </div>
    </div>
  );
};

export default App;
