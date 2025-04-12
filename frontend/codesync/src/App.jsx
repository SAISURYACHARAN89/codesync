import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import MonacoEditor from "react-monaco-editor";
import { Buffer } from "buffer";
import { motion, AnimatePresence } from "framer-motion";
// import CodeEditor from "./components/CodeEditor";
// import usePageTransitions from "./components/usePageTrans";
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
  const [mediaError, setMediaError] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const localVideoRef = useRef();
  const [peers, setPeers] = useState([]);
  const localStreamRef = useRef();
  const peerConnections = useRef({});
  const socketRef = useRef();
  const editorRef = useRef();

  // Check for mobile view
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Initialize socket connection
  useEffect(() => {
    const socket = io("https://codesync-q15y.onrender.com", {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 30000,
      forceNew: false,
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: "20px",
          padding: isMobile ? "10px" : "20px",
          backgroundColor: "#282c34",
          minHeight: "100vh",
        }}
      >
        {/* Main content area */}
        <div
          style={{
            flex: 1,
            width: isMobile ? "100%" : "auto",
            overflow: isMobile ? "hidden" : "visible",
          }}
        >
          <motion.h1
            style={{
              color: "#d84041",
              fontSize: isMobile ? "24px" : "32px",
              textAlign: isMobile ? "center" : "left",
            }}
            variants={itemVariants}
          >
            Code Sync
          </motion.h1>

          <motion.div
            variants={itemVariants}
            style={{
              marginBottom: "10px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "10px",
              alignItems: isMobile ? "stretch" : "center",
            }}
          >
            <span
              style={{
                color: "white",
                textAlign: isMobile ? "center" : "left",
              }}
            >
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

            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: "10px",
                alignItems: "stretch",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <motion.button
                onClick={handleCreateRoom}
                disabled={!socketRef.current?.connected}
                whileHover={{ scale: 1.05, backgroundColor: "#e05a5b" }}
                whileTap={{ scale: 0.95 }}
                style={{
                  backgroundColor: "#d84041",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background-color 0.2s",
                  width: isMobile ? "100%" : "auto",
                }}
                whileFocus={{ boxShadow: "0 0 0 2px rgba(216, 64, 65, 0.5)" }}
              >
                Create Room
              </motion.button>

              <motion.button
                onClick={handleJoinRoom}
                disabled={!socketRef.current?.connected}
                whileHover={{ scale: 1.05, backgroundColor: "#e05a5b" }}
                whileTap={{ scale: 0.95 }}
                style={{
                  backgroundColor: "#d84041",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background-color 0.2s",
                  width: isMobile ? "100%" : "auto",
                }}
                whileFocus={{ boxShadow: "0 0 0 2px rgba(216, 64, 65, 0.5)" }}
              >
                Join Room
              </motion.button>
            </div>

            {roomId && (
              <span
                style={{
                  color: "white",
                  textAlign: isMobile ? "center" : "left",
                  wordBreak: "break-all",
                }}
              >
                Room: {roomId}
              </span>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: "10px",
                alignItems: "center",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <motion.select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{
                  padding: "8px",
                  width: isMobile ? "100%" : "auto",
                }}
                whileFocus={{ scale: 1.02 }}
              >
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </motion.select>

              <motion.button
                onClick={handleRunCode}
                disabled={isLoading || !socketRef.current?.connected}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{
                  backgroundColor: isLoading ? "#d84041" : "#d84041",
                }}
                style={{
                  backgroundColor: "#d84041",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  transition: "background-color 0.2s",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {isLoading ? "Running..." : "Run"}
              </motion.button>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            style={{
              width: "100%",
              overflow: "hidden",
            }}
          >
            <MonacoEditor
              width={isMobile ? "100%" : "100%"}
              height={isMobile ? "300" : "500"}
              language={language}
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              editorDidMount={handleEditorMount}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: isMobile ? 14 : 16,
                lineHeight: isMobile ? 20 : 24,
              }}
            />
          </motion.div>

          <motion.div
            style={{
              marginTop: "20px",
              width: "100%",
            }}
            variants={itemVariants}
          >
            <h3 style={{ color: "white" }}>Input</h3>
            <motion.textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                width: "100%",
                height: "80px",
                padding: "8px",
                boxSizing: "border-box",
              }}
              placeholder="Enter input for your code here..."
              whileFocus={{
                boxShadow: "0 0 0 2px #d84041",
                color: "white",
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            />

            <h3 style={{ color: "white", marginTop: "15px" }}>
              Output {isLoading && "(Running...)"}
            </h3>
            <motion.pre
              style={{
                background: "#f0f0f0",
                padding: "10px",
                whiteSpace: "pre-wrap",
                maxHeight: "200px",
                overflow: "auto",
                width: "100%",
                boxSizing: "border-box",
              }}
              animate={{
                backgroundColor: isLoading ? "#f8f8f8" : "#f0f0f0",
              }}
            >
              {output || "No output yet"}
            </motion.pre>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default App;
