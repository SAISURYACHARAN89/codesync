const express = require('express');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');

const app = express();

// Enable CORS with credentials
app.use(
  cors({
    origin: '*', // Allow frontend domain (update as needed)
    credentials: true,
  })
);

app.use(express.json());


// Create an HTTP server
const server = http.createServer(app);

// Set up Socket.IO
const io = new Server(server, {
  cors: {
    origin: ['https://localhost:5173','https://192.168.239.242:5173','https://codesync-hri4.vercel.app/'], // Allow frontend origin
    methods: ['GET', 'POST'],
    credentials: true, // Allow credentials
  },
});

// Store active rooms
const rooms = {};

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle room creation
  socket.on('create-room', () => {
    const roomId = generateRoomId(); // Generate a unique room ID
    rooms[roomId] = { users: [socket.id] }; // Create a new room
    socket.join(roomId); // Join the room
    socket.emit('room-created', roomId); // Send room ID to the creator
  });

  // Handle joining a room
  socket.on('join-room', (roomId) => {
    if (rooms[roomId]) {
      socket.join(roomId); // Join the room
      rooms[roomId].users.push(socket.id); // Add user to the room
      socket.emit('room-joined', roomId); // Notify the user
      io.to(roomId).emit('user-connected', socket.id); // Notify others in the room
    } else {
      socket.emit('room-not-found'); // Notify the user if the room doesn't exist
    }
  });

  // Handle code updates within a room
  socket.on('code-change', (newCode, roomId) => {
    socket.to(roomId).emit('code-update', newCode); // Broadcast to the room
  });

  // Handle cursor updates within a room
  socket.on('cursor-update', ({ cursorPosition }, roomId) => {
    socket.to(roomId).emit('cursor-update', { userId: socket.id, cursorPosition });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    for (const roomId in rooms) {
      if (rooms[roomId].users.includes(socket.id)) {
        rooms[roomId].users = rooms[roomId].users.filter((id) => id !== socket.id); // Remove user from the room
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId]; // Delete the room if empty
        } else {
          io.to(roomId).emit('user-disconnected', socket.id); // Notify others in the room
        }
      }
    }
  });
});

// Helper function to generate a unique room ID
const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};


// Run code in a Docker container
app.post('/run-code', (req, res) => {
  const { code, language, roomId } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  let command;
  switch (language) {
    case 'python':
      command = `python3 -c "${code.replace(/"/g, '\\"')}"`;
      break;
    case 'cpp':
      command = `echo '${code}' > temp.cpp && g++ temp.cpp -o temp && ./temp`;
      break;
    case 'java':
      command = `echo '${code}' > Main.java && javac Main.java && java Main`;
      break;
    default:
      return res.status(400).json({ error: 'Unsupported language' });
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || error.message });
    }
    io.to(roomId).emit('output-update', stdout);
    res.json({ output: stdout });
  });
});

app.get("/",(req,res)=>{
  res.send("test sucess");
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`))
  .on('error', (err) => console.error('❌ Server startup error:', err));