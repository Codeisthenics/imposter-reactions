import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";

const PHASE_LABELS = {
  lobby: "LOBBY",
  prompt: "DESCRIBE",
  reveal: "REVEAL",
  voting: "VOTE",
  result: "RESULT",
};

export default function App() {
  const socketRef = useRef(null);
  const [screen, setScreen] = useState("home"); // home | game
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [phase, setPhase] = useState("lobby");
  const [error, setError] = useState("");

  // Game state
  const [isImposter, setIsImposter] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const [wordInput, setWordInput] = useState("");
  const [wordSubmitted, setWordSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [revealedWords, setRevealedWords] = useState([]);
  const [votedFor, setVotedFor] = useState(null);
  const [voteCount, setVoteCount] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("room_joined", ({ code, playerId: pid }) => {
      setPlayerId(pid);
      setRoomCode(code);
      setScreen("game");
      setPhase("lobby");
      setError("");
    });

    socket.on("room_update", ({ players: p, phase: ph }) => {
      setPlayers(p);
      setPhase(ph);
      const me = p.find((pl) => pl.id === socket.id);
      setIsHost(me?.isHost || false);
    });

    socket.on("game_started", ({ phase: ph, prompt: pr, isImposter: imp }) => {
      setPhase(ph);
      setIsImposter(imp);
      setPrompt(pr);
      setWordInput("");
      setWordSubmitted(false);
      setSubmittedCount(0);
      setRevealedWords([]);
      setVotedFor(null);
      setVoteCount(0);
      setResult(null);
    });

    socket.on("word_submitted_count", ({ submitted }) => {
      setSubmittedCount(submitted);
    });

    socket.on("reveal_words", ({ words }) => {
      setPhase("reveal");
      setRevealedWords(words);
    });

    socket.on("voting_started", () => {
      setPhase("voting");
    });

    socket.on("vote_submitted_count", ({ submitted }) => {
      setVoteCount(submitted);
    });

    socket.on("game_result", (data) => {
      setPhase("result");
      setResult(data);
    });

    socket.on("back_to_lobby", () => {
      setPhase("lobby");
      setIsImposter(false);
      setPrompt(null);
      setWordInput("");
      setWordSubmitted(false);
      setRevealedWords([]);
      setVotedFor(null);
      setResult(null);
    });

    socket.on("error", ({ message }) => {
      setError(message);
    });

    return () => socket.disconnect();
  }, []);

  const createRoom = () => {
    if (!name.trim()) return setError("Enter your name first.");
    setError("");
    socketRef.current.emit("create_room", { name: name.trim() });
  };

  const joinRoom = () => {
    if (!name.trim()) return setError("Enter your name first.");
    if (!inputCode.trim()) return setError("Enter a room code.");
    setError("");
    socketRef.current.emit("join_room", { name: name.trim(), code: inputCode.trim().toUpperCase() });
  };

  const startGame = () => {
    if (players.length < 4) return setError("Need at least 4 players.");
    socketRef.current.emit("start_game");
  };

  const submitWord = () => {
    const clean = wordInput.trim().replace(/\s+/g, "");
    if (!clean) return setError("Enter a single word.");
    if (clean.includes(" ")) return setError("One word only, no spaces.");
    socketRef.current.emit("submit_word", { word: clean });
    setWordSubmitted(true);
    setError("");
  };

  const startVoting = () => {
    socketRef.current.emit("start_voting");
  };

  const submitVote = (targetId) => {
    if (votedFor) return;
    setVotedFor(targetId);
    socketRef.current.emit("submit_vote", { targetId });
  };

  const playAgain = () => {
    socketRef.current.emit("play_again");
  };

  const handleWordKeyDown = (e) => {
    // Allow only single word (no spaces)
    if (e.key === " ") e.preventDefault();
    if (e.key === "Enter") submitWord();
  };

  // ─── HOME SCREEN ──────────────────────────────────────────────
  if (screen === "home") {
    return (
      <div className="container">
        <div className="home-card">
          <div className="logo">
            <span className="logo-main">IMPOSTER</span>
            <span className="logo-sub">REACTIONS</span>
          </div>
          <p className="tagline">One word. One liar. Who's the imposter?</p>

          <div className="input-group">
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              autoFocus
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="home-actions">
            <button className="btn btn-primary" onClick={createRoom}>
              Create Room
            </button>
            <div className="divider"><span>or join</span></div>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="Room code"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                maxLength={5}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              />
              <button className="btn btn-secondary" onClick={joinRoom}>
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── GAME SCREEN ──────────────────────────────────────────────
  return (
    <div className="container">
      <div className="game-wrap">
        {/* Header */}
        <div className="game-header">
          <div className="room-code-badge">
            <span className="room-label">ROOM</span>
            <span className="room-code">{roomCode}</span>
          </div>
          <div className="phase-badge">{PHASE_LABELS[phase] || phase.toUpperCase()}</div>
        </div>

        {/* LOBBY */}
        {phase === "lobby" && (
          <PhaseCard title="Waiting for players...">
            <PlayerList players={players} playerId={playerId} />
            <p className="hint-text">4–8 players required</p>
            {error && <div className="error-msg">{error}</div>}
            {isHost ? (
              <button className="btn btn-primary btn-wide" onClick={startGame} disabled={players.length < 4}>
                {players.length < 4 ? `Need ${4 - players.length} more player(s)` : "Start Game →"}
              </button>
            ) : (
              <div className="waiting-pill">Waiting for host to start...</div>
            )}
          </PhaseCard>
        )}

        {/* PROMPT */}
        {phase === "prompt" && (
          <PhaseCard title={isImposter ? "You are the IMPOSTER" : "Describe this in one word"}>
            {isImposter ? (
              <div className="imposter-reveal">
                <div className="spy-icon">🕵️</div>
                <p>Blend in. Everyone else has a prompt — you don't.</p>
                <p>Submit a convincing word to avoid detection.</p>
              </div>
            ) : (
              <div className="prompt-box">
                <span className="prompt-word">{prompt}</span>
              </div>
            )}

            {!wordSubmitted ? (
              <div className="word-input-group">
                <input
                  className="input word-input"
                  placeholder="One word..."
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value.replace(/\s/g, ""))}
                  onKeyDown={handleWordKeyDown}
                  maxLength={24}
                  autoFocus
                />
                {error && <div className="error-msg">{error}</div>}
                <button className="btn btn-primary btn-wide" onClick={submitWord}>
                  Submit Word
                </button>
              </div>
            ) : (
              <div className="submitted-state">
                <div className="check-icon">✓</div>
                <p>Word submitted!</p>
                <div className="waiting-pill">
                  {submittedCount}/{players.length} submitted
                </div>
              </div>
            )}
          </PhaseCard>
        )}

        {/* REVEAL */}
        {phase === "reveal" && (
          <PhaseCard title="What everyone said">
            <div className="words-grid">
              {revealedWords.map((w, i) => (
                <div key={i} className="word-card">
                  <span className="word-card-word">{w.word}</span>
                  <span className="word-card-name">{w.name}</span>
                </div>
              ))}
            </div>
            {isHost ? (
              <button className="btn btn-primary btn-wide" onClick={startVoting}>
                Start Voting →
              </button>
            ) : (
              <div className="waiting-pill">Waiting for host to start voting...</div>
            )}
          </PhaseCard>
        )}

        {/* VOTING */}
        {phase === "voting" && (
          <PhaseCard title="Who is the imposter?">
            <p className="hint-text">Tap a player to vote them out</p>
            <div className="vote-list">
              {players.map((p) => (
                <button
                  key={p.id}
                  className={`vote-btn ${votedFor === p.id ? "voted" : ""} ${p.id === playerId ? "self" : ""} ${votedFor && votedFor !== p.id ? "dimmed" : ""}`}
                  onClick={() => p.id !== playerId && submitVote(p.id)}
                  disabled={!!votedFor || p.id === playerId}
                >
                  <span className="vote-name">{p.name}</span>
                  {p.id === playerId && <span className="you-tag">you</span>}
                  {votedFor === p.id && <span className="voted-tag">✓ Voted</span>}
                </button>
              ))}
            </div>
            {votedFor && (
              <div className="waiting-pill">
                {voteCount}/{players.length} votes cast
              </div>
            )}
          </PhaseCard>
        )}

        {/* RESULT */}
        {phase === "result" && result && (
          <PhaseCard title={result.imposterCaught ? "Imposter Caught! 🎉" : "Imposter Wins! 🕵️"}>
            <div className={`result-banner ${result.imposterCaught ? "caught" : "escaped"}`}>
              {result.imposterCaught ? (
                <>
                  <p><strong>{result.eliminatedName}</strong> was eliminated and they were the imposter!</p>
                  <p className="result-sub">Players win!</p>
                </>
              ) : (
                <>
                  <p><strong>{result.eliminatedName}</strong> was eliminated but they were innocent!</p>
                  <p className="result-sub">
                    The real imposter was <strong>{result.imposterName}</strong>!
                  </p>
                </>
              )}
            </div>

            <div className="prompt-reveal">
              The prompt was: <strong>{result.prompt}</strong>
            </div>

            <div className="vote-tally">
              <h4>Vote Tally</h4>
              {result.voteTally
                .sort((a, b) => b.votes - a.votes)
                .map((v, i) => (
                  <div key={i} className="tally-row">
                    <span className="tally-name">{v.name}</span>
                    <span className="tally-votes">{v.votes} vote{v.votes !== 1 ? "s" : ""}</span>
                  </div>
                ))}
            </div>

            {isHost && (
              <button className="btn btn-primary btn-wide" onClick={playAgain}>
                Play Again
              </button>
            )}
            {!isHost && <div className="waiting-pill">Waiting for host to restart...</div>}
          </PhaseCard>
        )}
      </div>
    </div>
  );
}

function PhaseCard({ title, children }) {
  return (
    <div className="phase-card">
      <h2 className="phase-title">{title}</h2>
      {children}
    </div>
  );
}

function PlayerList({ players, playerId }) {
  return (
    <div className="player-list">
      {players.map((p) => (
        <div key={p.id} className={`player-chip ${p.id === playerId ? "me" : ""}`}>
          <span className="player-dot" />
          <span>{p.name}</span>
          {p.isHost && <span className="host-badge">HOST</span>}
          {p.id === playerId && <span className="you-badge">YOU</span>}
        </div>
      ))}
    </div>
  );
}