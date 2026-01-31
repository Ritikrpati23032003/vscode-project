require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const initializeSocket = require('./socket/socketHandler');
const codespaceApiRoutes = require('./routes/codeSpaceApi');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: "*",        // or "http://3.85.118.200"
    methods: ["GET", "POST"],
  },
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected : ', mongoose.connection.host))
    .catch(err => console.error(err));

// Initialize Socket.io logic first
initializeSocket(io);

// API Routes - pass io instance for real-time events
app.use('/api/codespaces', codespaceApiRoutes(io));

const PORT = process.env.PORT || 5000;
server.listen(PORT,"0.0.0.0", () => console.log(`Server is running on port ${PORT}`));
