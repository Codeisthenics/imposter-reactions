const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://imposter-reactions.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'] // Ensures both are supported
});

const PROMPTS = [
  "Beach", "Volcano", "Wedding", "Haunted House", "Football",
  "Jungle", "Space Station", "Pirate Ship", "Library", "Circus",
  "Hospital", "Ski Resort", "Underwater", "Desert", "Casino",
  "Kindergarten", "Prison", "Restaurant", "Airport", "Zoo",
  "Halloween", "Christmas", "Olympics", "Submarine", "Volcano",
  "Museum", "Pharmacy", "Supermarket", "Skatepark", "Graveyard",
];

const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getRoom(code) {
  return rooms[code];
}

function broadcastRoom(code) {
  const room = getRoom(code);
  if (!room) return;
  io.to(code).emit("room_update", {
    players: room.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
    phase: room.phase,
    code: room.code,
  });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create_room", ({ name }) => {
    const code = generateCode();
    rooms[code] = {
      code,
      phase: "lobby",
      players: [{ id: socket.id, name, isHost: true }],
      imposter: null,
      prompt: null,
      words: {},
      votes: {},
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room_joined", { code, playerId: socket.id });
    broadcastRoom(code);
  });

  socket.on("join_room", ({ name, code }) => {
    const room = getRoom(code);
    if (!room) return socket.emit("error", { message: "Room not found." });
    if (room.phase !== "lobby") return socket.emit("error", { message: "Game already in progress." });
    if (room.players.length >= 8) return socket.emit("error", { message: "Room is full (max 8 players)." });
    if (room.players.find((p) => p.name.toLowerCase() === name.toLowerCase()))
      return socket.emit("error", { message: "Name already taken in this room." });

    room.players.push({ id: socket.id, name, isHost: false });
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room_joined", { code, playerId: socket.id });
    broadcastRoom(code);
  });

  socket.on("start_game", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return;
    if (room.players.length < 4) return socket.emit("error", { message: "Need at least 4 players to start." });

    // Assign imposter
    const imposterIndex = Math.floor(Math.random() * room.players.length);
    room.imposter = room.players[imposterIndex].id;
    room.prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    room.phase = "prompt";
    room.words = {};
    room.votes = {};

    // Send individual roles
    room.players.forEach((p) => {
      io.to(p.id).emit("game_started", {
        phase: "prompt",
        prompt: p.id === room.imposter ? null : room.prompt,
        isImposter: p.id === room.imposter,
      });
    });
    broadcastRoom(code);
  });

  socket.on("submit_word", ({ word }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room || room.phase !== "prompt") return;
    const clean = word.trim().replace(/\s+/g, "").toLowerCase();
    if (!clean) return;

    room.words[socket.id] = clean;

    // Check if all submitted
    if (Object.keys(room.words).length === room.players.length) {
      room.phase = "reveal";
      const wordList = room.players.map((p) => ({
        name: p.name,
        word: room.words[p.id] || "???",
      }));
      io.to(code).emit("reveal_words", { words: wordList });
      broadcastRoom(code);
    } else {
      const submitted = Object.keys(room.words).length;
      io.to(code).emit("word_submitted_count", { submitted, total: room.players.length });
    }
  });

  socket.on("start_voting", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return;

    room.phase = "voting";
    io.to(code).emit("voting_started", {
      players: room.players.map((p) => ({ id: p.id, name: p.name })),
    });
    broadcastRoom(code);
  });

  socket.on("submit_vote", ({ targetId }) => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room || room.phase !== "voting") return;

    room.votes[socket.id] = targetId;

    if (Object.keys(room.votes).length === room.players.length) {
      // Tally votes
      const tally = {};
      Object.values(room.votes).forEach((id) => {
        tally[id] = (tally[id] || 0) + 1;
      });
      const maxVotes = Math.max(...Object.values(tally));
      const topIds = Object.keys(tally).filter((id) => tally[id] === maxVotes);
      const eliminated = topIds[Math.floor(Math.random() * topIds.length)];
      const imposterCaught = eliminated === room.imposter;
      const imposterName = room.players.find((p) => p.id === room.imposter)?.name;
      const eliminatedName = room.players.find((p) => p.id === eliminated)?.name;

      room.phase = "result";
      io.to(code).emit("game_result", {
        imposterCaught,
        imposterName,
        eliminatedName,
        imposter: room.imposter,
        prompt: room.prompt,
        voteTally: room.players.map((p) => ({
          name: p.name,
          votes: tally[p.id] || 0,
        })),
      });
      broadcastRoom(code);
    } else {
      const submitted = Object.keys(room.votes).length;
      io.to(code).emit("vote_submitted_count", { submitted, total: room.players.length });
    }
  });

  socket.on("play_again", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return;

    room.phase = "lobby";
    room.imposter = null;
    room.prompt = null;
    room.words = {};
    room.votes = {};
    io.to(code).emit("back_to_lobby");
    broadcastRoom(code);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) {
      delete rooms[code];
    } else {
      // Reassign host if needed
      if (!room.players.find((p) => p.isHost)) {
        room.players[0].isHost = true;
      }
      broadcastRoom(code);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Ping the server every 14 minutes to keep it from sleeping
const URL = `https://imposter-reactions.onrender.com`; // Replace with your Render URL
setInterval(() => {
  http.get(URL, (res) => {
    console.log(`Self-ping sent. Status: ${res.statusCode}`);
  });
}, 840000); // 14 minutes in milliseconds