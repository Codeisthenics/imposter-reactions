# 🕵️ Imposter Reactions

A real-time multiplayer party game for 4–8 players.  
One player sees a word prompt — but one among you is the **Imposter** who sees nothing.  
Submit one word. Vote out the liar.

---

## 🗂 Folder Structure

```
imposter-reactions/
├── server/
│   ├── index.js          # Node.js + Express + Socket.io backend
│   └── package.json
├── client/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js        # All React UI + game state
│   │   ├── App.css       # Dark theme styles
│   │   └── index.js      # React entry point
│   └── package.json
├── start.sh              # One-command launcher (Mac/Linux)
└── README.md
```

---

## 🚀 Quick Start (Recommended)

### Prerequisites
- **Node.js** v16 or higher — https://nodejs.org/

### Option A: Auto-start script (Mac / Linux)
```bash
chmod +x start.sh
./start.sh
```
This installs dependencies for both server and client, then launches both simultaneously.

### Option B: Manual setup

**Terminal 1 — Backend:**
```bash
cd server
npm install
npm start
# Server running on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd client
npm install
npm start
# App opens at http://localhost:3000
```

---

## 🌐 Playing with Friends (Same Network)

1. Run the server on your machine
2. Find your local IP: `ipconfig` (Windows) or `ifconfig` / `ip addr` (Mac/Linux)
3. In `client/src/App.js`, change:
   ```js
   const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";
   ```
   to:
   ```js
   const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://YOUR_LOCAL_IP:3001";
   ```
4. Rebuild or restart the client
5. Friends open `http://YOUR_LOCAL_IP:3000` on their phones/laptops

---

## 🎮 How to Play

| Phase | What happens |
|-------|-------------|
| **Lobby** | Players join with a room code. Host starts when 4–8 players are in. |
| **Describe** | Everyone sees the same word (e.g. "Beach"). The imposter sees nothing. Each player submits ONE word. |
| **Reveal** | All submitted words are shown together. |
| **Vote** | Players tap a name to vote out who they think is the imposter. |
| **Result** | Imposter is revealed. Players win if they guessed right; imposter wins if they escape! |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `REACT_APP_SOCKET_URL` | `http://localhost:3001` | WebSocket server URL |

Set `REACT_APP_SOCKET_URL` in `client/.env` for deployment.

---

## 🛠 Tech Stack

- **Frontend**: React 18
- **Backend**: Node.js + Express
- **Real-time**: Socket.io v4
- **Fonts**: Syne + Space Mono (Google Fonts)
