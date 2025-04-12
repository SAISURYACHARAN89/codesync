import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import { io } from "socket.io-client";

const VideoChat = ({ roomId }) => {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const [peers, setPeers] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const peersRef = useRef([]);
  const socketRef = useRef();

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io("https://codesync-q15y.onrender.com");

    const setupMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        localVideoRef.current.srcObject = stream;
        setLocalStream(stream);

        socketRef.current.emit("join-room", roomId);

        socketRef.current.on("user-connected", userId => {
          console.log("User connected:", userId);
          if (userId !== socketRef.current.id) {
            const peer = createPeer(userId, socketRef.current.id, stream);
            peersRef.current.push({
              peerId: userId,
              peer,
            });
            setPeers([...peersRef.current]);
          }
        });

        socketRef.current.on("signal", payload => {
          console.log("Received signal from:", payload.from);
          const existingPeer = peersRef.current.find(p => p.peerId === payload.from);
          
          if (!existingPeer) {
            const peer = addPeer(payload.signal, payload.from, stream);
            peersRef.current.push({
              peerId: payload.from,
              peer,
            });
            setPeers([...peersRef.current]);
          } else {
            existingPeer.peer.signal(payload.signal);
          }
        });

        socketRef.current.on("user-disconnected", userId => {
          console.log("User disconnected:", userId);
          const peerObj = peersRef.current.find(p => p.peerId === userId);
          if (peerObj) peerObj.peer.destroy();
          
          peersRef.current = peersRef.current.filter(p => p.peerId !== userId);
          setPeers([...peersRef.current]);
        });

      } catch (err) {
        console.error("Failed to get media devices:", err);
      }
    };

    setupMedia();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      peersRef.current.forEach(peerObj => peerObj.peer.destroy());
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [roomId]);

  function createPeer(userId, callerId, stream) {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      }
    });

    peer.on("signal", signal => {
      socketRef.current.emit("signal", { 
        roomId, 
        signal, 
        to: userId, 
        from: callerId 
      });
    });

    peer.on("stream", remoteStream => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peer.on("error", err => {
      console.error("Peer error:", err);
    });

    return peer;
  }

  function addPeer(incomingSignal, callerId, stream) {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      }
    });

    peer.on("signal", signal => {
      socketRef.current.emit("signal", { 
        roomId, 
        signal, 
        to: callerId, 
        from: socketRef.current.id 
      });
    });

    peer.on("stream", remoteStream => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });

    peer.on("error", err => {
      console.error("Peer error:", err);
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
        style={{ width: "200px", height: "150px", border: "2px solid green" }}
      />
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{ width: "200px", height: "150px", border: "2px solid blue" }}
      />
    </div>
  );
};

export default VideoChat;