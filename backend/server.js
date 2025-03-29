const express = require('express');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Docker = require('dockerode');
const docker = new Docker();

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
    origin: '*', // Allow frontend origin
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

// Function to strip Docker log headers
const stripDockerHeader = (logs) => {
  return logs
    .toString()
    .split('\n')
    .map((line) => {
      // Remove the first 8 bytes (Docker log header)
      return line.slice(8);
    })
    .join('\n');
};

// Run code in a Docker container
app.post('/run-code', async (req, res) => {
  const { code, language, roomId,input } = req.body;

  // Validate input
  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  let dockerImage, command;
  switch (language) {
    case 'python':
      dockerImage = 'python:3.9';
      command = `python -c "${code.replace(/"/g, '\\"')}"`;
      break;
    case 'cpp':
      dockerImage = 'gcc';
      command = `bash -c "echo '${code.replace(/"/g, '\\"')}' > temp.cpp && g++ temp.cpp -o temp && ./temp"`;
      break;
    case 'java':
      dockerImage = 'openjdk:11';
      command = `bash -c "echo '${code.replace(/"/g, '\\"')}' > Main.java && javac Main.java && java Main"`;
      break;
    default:
      return res.status(400).json({ error: 'Unsupported language' });
  }

  let container;
  try {
    // Pull the Docker image if it doesn't exist locally
    try {
      await docker.getImage(dockerImage).inspect();
    } catch (err) {
      console.log(`Pulling Docker image: ${dockerImage}`);
      await docker.pull(dockerImage);
    }

    // Create the container
    container = await docker.createContainer({
      Image: dockerImage,
      Cmd: ['sh', '-c', command],
      Tty: false,
    });

    // Start the container
    await container.start();

    // Wait for the container to finish execution (with a timeout of 5 seconds)
    const timeout = 5000; // 5 seconds
    const logs = await new Promise((resolve, reject) => {
      // Set a timeout to handle long-running containers
      const timeoutId = setTimeout(() => {
        reject(new Error('Container execution timed out'));
      }, timeout);

      // Get container logs
      container.logs({ stdout: true, stderr: true, follow: true }, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          return reject(err);
        }

        let output = '';
        stream.on('data', (chunk) => {
          output += chunk.toString();
        });

        stream.on('end', () => {
          clearTimeout(timeoutId);
          resolve(output);
        });

        stream.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    });

    // Strip Docker log headers from the output
    const cleanLogs = stripDockerHeader(logs);

    // Attempt to stop the container (if it's still running)
    try {
      await container.stop();
    } catch (stopErr) {
      // Ignore errors if the container is already stopped
      if (!stopErr.message.includes('already stopped')) {
        throw stopErr;
      }
    }

    // Remove the container
    try {
      await container.remove();
    } catch (removeErr) {
      // Ignore errors if the container is already removed
      if (!removeErr.message.includes('no such container')) {
        throw removeErr;
      }
    }

    // Emit the output to the room
    io.to(roomId).emit('output-update', cleanLogs);

    // Send the clean output back to the client
    res.json({ output: cleanLogs });
  } catch (err) {
    console.error('Error running code:', err);

    // Force remove the container if it exists
    if (container) {
      try {
        await container.stop();
      } catch (stopErr) {
        // Ignore errors if the container is already stopped
        if (!stopErr.message.includes('already stopped')) {
          console.error('Error stopping container:', stopErr);
        }
      }

      try {
        await container.remove();
      } catch (removeErr) {
        // Ignore errors if the container is already removed
        if (!removeErr.message.includes('no such container')) {
          console.error('Error removing container:', removeErr);
        }
      }
    }

    // Send error response to the client
    res.status(500).json({ error: err.message });
  }
});
app.get("/",(req,res)=>{
  res.send("test sucess");
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`))
  .on('error', (err) => console.error('❌ Server startup error:', err));