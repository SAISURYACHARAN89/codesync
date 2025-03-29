import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import { io } from "socket.io-client";

const socket = io("https://192.168.239.242:5000/"); // Change to your server URL

const VideoChat = ({ roomId }) => {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const [peer, setPeer] = useState(null);

  useEffect(() => {
    socket.emit("join-room", roomId);

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;

        socket.on("user-joined", (userId) => {
          const newPeer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream,
          });

          newPeer.on("signal", (signal) => {
            socket.emit("signal", { roomId, signal, to: userId });
          });

          newPeer.on("stream", (remoteStream) => {
            remoteVideoRef.current.srcObject = remoteStream;
          });

          setPeer(newPeer);
        });

        socket.on("signal", ({ signal, from }) => {
          const newPeer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream,
          });

          newPeer.on("signal", (returnSignal) => {
            socket.emit("signal", { roomId, signal: returnSignal, to: from });
          });

          newPeer.on("stream", (remoteStream) => {
            remoteVideoRef.current.srcObject = remoteStream;
          });

          newPeer.signal(signal);
          setPeer(newPeer);
        });
      })
      .catch((err) => console.error("Error accessing media devices:", err));

    return () => {
      peer?.destroy();
      socket.disconnect();
    };
  }, [roomId]);

  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <video
        ref={localVideoRef}
        autoPlay
        muted
        style={{ width: "200px", height: "150px" }}
      />
      <video
        ref={remoteVideoRef}
        autoPlay
        style={{ width: "200px", height: "150px" }}
      />
    </div>
  );
};

export default VideoChat;
