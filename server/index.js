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

const PEXELS_API_KEY = 'GlXEgWcUaMC7TvaqUPEYtb21laAdcrIa38TBiBKicsY2OcwFKwAxHZoY';

const VIDEO_PAIRS = [ ];

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

  socket.on("start_game", async () => {
    const code = socket.data.roomCode;
    const room = getRoom(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player?.isHost) return;
    if (room.players.length < 4) return socket.emit("error", { message: "Need at least 4 players to start." });

    // 1. 30+ Funny, Weird, and Interesting Themes
    const themes = [
      'Cyberpunk', 'Northern Lights', 'Deep Sea', 'Wildlife', 'Crowds',
      'Funny Cat', 'Interpretive Dance', 'Glitch Art', 'Bizarre', 'Microscopic',
      'Retro Future', 'Surreal', 'Wobbly', 'Extreme Close Up', 'Food Explosion',
      'Rubber Duck', 'Slow Motion Water', 'Mannequin', 'Optical Illusion', 'Lava Lamp',
      'Cactus', 'Space Travel', 'Ancient Ruins', 'Neon City', 'Rollercoaster',
      'Jellyfish', 'Vaporwave', 'Abstract Motion', 'Robot Dance', 'Parkour',
      'Trippy', 'Kaleidoscope', 'Funny Dog', 'Macro Insects'
    ];

    const selectedTheme = themes[Math.floor(Math.random() * themes.length)];

    // 2. Jump to a random page (1-15) to ensure fresh video results
    const randomPage = Math.floor(Math.random() * 15) + 1;

    try {
      // Fetch 15 videos so we can shuffle them
      const response = await fetch(
        `https://api.pexels.com/videos/search?query=${selectedTheme}&per_page=15&page=${randomPage}&min_width=1280`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const data = await response.json();

      if (!data.videos || data.videos.length < 5) throw new Error("Not enough variety found");

      // 3. Shuffle the results locally so we aren't always picking the first ones
      const shuffled = data.videos.sort(() => 0.5 - Math.random());

      // Helper to find the best HD link
      const getBestLink = (v) => v.video_files.find(f => f.quality === 'hd')?.link || v.video_files[0].link;

      const v1 = getBestLink(shuffled[0]);
      const v2 = getBestLink(shuffled[1]);

      const imposterIndex = Math.floor(Math.random() * room.players.length);
      room.imposter = room.players[imposterIndex].id;

      room.prompt = { category: selectedTheme };
      room.phase = "prompt";
      room.words = {};
      room.votes = {};

      room.players.forEach((p) => {
        const isImp = p.id === room.imposter;
        io.to(p.id).emit("game_started", {
          phase: "prompt",
          // Send a unique clip to the imposter and the other to the group
          prompt: isImp ? v2 : v1,
          isImposter: false, // Keep it secret!
          category: selectedTheme
        });
      });

      broadcastRoom(code);

    } catch (err) {
      console.error("Pexels API Error:", err);
      socket.emit("error", { message: "Failed to fetch footage. Try again!" });
    }
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
      // Inside your backend submit_vote check (when all votes are in)
      io.to(code).emit("game_result", {
        imposterCaught,
        imposterName,
        eliminatedName,
        // CHANGE THIS: Add '.category' to send the text name, not the whole object
        prompt: room.prompt.category,
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