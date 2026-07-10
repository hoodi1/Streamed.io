const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// rooms: Map<roomCode, { streamerId: string, viewers: Set<string> }>
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ── Streamer creates a room ──────────────────────────────────────────────
  socket.on('create-room', (callback) => {
    let code, attempts = 0;
    do {
      code = generateCode();
      if (++attempts > 200) return callback({ error: 'Server full, try again.' });
    } while (rooms.has(code));

    rooms.set(code, { streamerId: socket.id, viewers: new Set() });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'streamer';

    callback({ code });
    console.log(`[Room] Created: ${code}`);
  });

  // ── Viewer joins a room ──────────────────────────────────────────────────
  socket.on('join-room', (code, callback) => {
    const upperCode = code?.toUpperCase?.();
    const room = rooms.get(upperCode);
    if (!room) return callback({ error: 'Room not found. Check the code.' });

    room.viewers.add(socket.id);
    socket.join(upperCode);
    socket.data.roomCode = upperCode;
    socket.data.role = 'viewer';

    // Tell streamer: new viewer wants a peer connection
    io.to(room.streamerId).emit('viewer-joined', { viewerId: socket.id });
    // Authoritative viewer count to streamer
    io.to(room.streamerId).emit('viewer-count', room.viewers.size);

    callback({ success: true });
    console.log(`[Room] ${upperCode}: viewer ${socket.id} joined (${room.viewers.size} total)`);
  });

  // ── WebRTC signaling relay (no media passes through here) ────────────────
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { roomCode, role } = socket.data;

    if (role === 'streamer' && roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        io.to(roomCode).emit('stream-ended');
        rooms.delete(roomCode);
        console.log(`[Room] ${roomCode} ended (streamer left)`);
      }
    } else if (role === 'viewer' && roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        room.viewers.delete(socket.id);
        io.to(room.streamerId).emit('viewer-count', room.viewers.size);
      }
    }
    console.log(`[-] ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Streamed.io signaling server running on port ${PORT}`);
});
