import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import { io } from "socket.io-client";

const socket = io("https://codesync-q15y.onrender.com"); // Change to your server URL

const VideoChat = ({ roomId }) => {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const [peers, setPeers] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const peersRef = useRef([]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;
        setLocalStream(stream);

        socket.emit("join-room", roomId);

        socket.on("user-joined", (userId) => {
          const peer = createPeer(userId, socket.id, stream, roomId);
          peersRef.current.push({
            peerId: userId,
            peer,
          });
          setPeers(peersRef.current);
        });

        socket.on("user-signal", (payload) => {
          const item = peersRef.current.find((p) => p.peerId === payload.from);
          if (!item) {
            const peer = addPeer(payload.signal, payload.from, stream);
            peersRef.current.push({
              peerId: payload.from,
              peer,
            });
            setPeers(peersRef.current);
          } else {
            item.peer.signal(payload.signal);
          }
        });

        socket.on("user-disconnected", (userId) => {
          const peerObj = peersRef.current.find((p) => p.peerId === userId);
          if (peerObj) peerObj.peer.destroy();
          peersRef.current = peersRef.current.filter(
            (p) => p.peerId !== userId
          );
          setPeers(peersRef.current);
        });
      })
      .catch((err) => console.error("Error accessing media devices:", err));

    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
      peersRef.current.forEach((peerObj) => peerObj.peer.destroy());
      socket.disconnect();
    };
  }, [roomId]);

  function createPeer(userId, callerId, stream, roomId) {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("signal", { roomId, signal, to: userId, from: callerId });
    });

    peer.on("stream", (remoteStream) => {
      remoteVideoRef.current.srcObject = remoteStream;
    });

    return peer;
  }

  function addPeer(incomingSignal, callerId, stream) {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("signal", { roomId, signal, to: callerId, from: socket.id });
    });

    peer.on("stream", (remoteStream) => {
      remoteVideoRef.current.srcObject = remoteStream;
    });

    peer.signal(incomingSignal);
    return peer;
  }

  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        style={{ width: "200px", height: "150px" }}
      />
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{ width: "200px", height: "150px" }}
      />
    </div>
  );
};

export default VideoChat;
