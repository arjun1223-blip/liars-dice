// Liar's Dice multiplayer server: serves the web app and runs private rooms over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const E = require('./public/engine.js');
const Bots = require('./public/bots.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 8;
const MAX_ROOMS = 2000;
const REVEAL_MS = 9000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

// ---------- static files ----------
const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Always check for a newer version of the game's code; images can be cached.
      'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}
const newId = () => crypto.randomBytes(6).toString('hex');
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';

function makeRoom(hostName) {
  const room = {
    code: newCode(),
    hostId: null,
    players: [],
    game: null,
    chat: [],
    botTimer: null,
    revealTimer: null,
    revealEndsAt: null,
    lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function addHuman(room, name, ws) {
  const p = { id: newId(), token: newId() + newId(), name: cleanName(name), isBot: false, ws, connected: true };
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function addBot(room) {
  const used = new Set(room.players.map((p) => p.name));
  const free = Bots.BOT_ROSTER.filter((b) => !used.has(b.name));
  const pick = free.length ? free[crypto.randomInt(free.length)] : { name: 'Bot ' + room.players.length, personality: 'balanced' };
  room.players.push({ id: newId(), name: pick.name, personality: pick.personality, isBot: true, connected: true });
}

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const isHost = (room, p) => room.hostId === p.id;

// A seat is "auto-played" when it is a bot, or its human is disconnected / left.
function autoPlayed(room, gamePlayer) {
  if (gamePlayer.isBot) return true;
  const rp = room.players.find((p) => p.id === gamePlayer.id);
  return !rp || !rp.connected;
}

function roomSummary(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    inGame: !!room.game,
    revealEndsAt: room.revealEndsAt,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, connected: p.connected })),
    chat: room.chat,
  };
}

function broadcast(room) {
  room.lastActive = Date.now();
  schedule(room);
  const summary = roomSummary(room);
  room.players.forEach((p) => {
    if (p.isBot || !p.ws) return;
    send(p.ws, { t: 'state', serverNow: Date.now(), you: p.id, room: summary, game: room.game ? E.viewFor(room.game, p.id) : null });
  });
}

function clearTimers(room) {
  clearTimeout(room.botTimer); room.botTimer = null;
  clearTimeout(room.revealTimer); room.revealTimer = null;
}

function schedule(room) {
  const g = room.game;
  if (!g) return;
  if (g.phase === 'bidding' && !room.botTimer) {
    const seat = g.players[g.turn];
    if (!autoPlayed(room, seat)) return;
    const turnAtSchedule = g.turn, roundAtSchedule = g.round, bids = g.bidHistory.length;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (room.game !== g || g.phase !== 'bidding' || g.turn !== turnAtSchedule || g.round !== roundAtSchedule || g.bidHistory.length !== bids) return;
      if (!autoPlayed(room, g.players[g.turn])) return;
      const err = E.act(g, g.turn, Bots.decide(g, g.turn));
      if (err) E.act(g, g.turn, { type: 'liar' }); // fallback, shouldn't happen
      broadcast(room);
    }, Bots.thinkMs());
  }
  if (g.phase === 'reveal' && !room.revealTimer) {
    room.revealEndsAt = Date.now() + REVEAL_MS;
    room.revealTimer = setTimeout(() => advance(room), REVEAL_MS);
  }
}

function advance(room) {
  if (!room.game || room.game.phase !== 'reveal') return;
  clearTimers(room);
  room.revealEndsAt = null;
  E.nextRound(room.game);
  broadcast(room);
}

function pushChat(room, from, text) {
  room.chat.push({ ts: Date.now(), from, text: String(text).slice(0, 200) });
  if (room.chat.length > 60) room.chat.shift();
}

function removePlayer(room, id) {
  room.players = room.players.filter((p) => p.id !== id);
  if (room.hostId === id) {
    const next = room.players.find((p) => !p.isBot && p.connected) || room.players.find((p) => !p.isBot);
    room.hostId = next ? next.id : null;
  }
  if (!room.players.some((p) => !p.isBot)) { clearTimers(room); rooms.delete(room.code); return; }
}

// ---------- sockets ----------
// Small message cap: game messages are tiny, so anything big is junk.
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null, me = null;

  const fail = (message) => send(ws, { t: 'error', message });
  const joined = () => send(ws, { t: 'joined', code: room.code, playerId: me.id, token: me.token });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    // --- not yet in a room ---
    if (m.t === 'create') {
      if (rooms.size >= MAX_ROOMS) return fail('The server is full right now. Try again soon.');
      room = makeRoom();
      me = addHuman(room, m.name, ws);
      joined(); broadcast(room); return;
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return fail('No room with that code.');
      if (r.game) return fail('That game is already in progress.');
      if (r.players.length >= MAX_PLAYERS) return fail('That room is full.');
      room = r; me = addHuman(room, m.name, ws);
      pushChat(room, null, `${me.name} joined.`);
      joined(); broadcast(room); return;
    }
    if (m.t === 'rejoin') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      const p = r && r.players.find((x) => x.token === m.token);
      if (!p) return send(ws, { t: 'rejoinFailed' });
      if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
      room = r; me = p; p.ws = ws; p.connected = true; clearTimeout(p.dropTimer);
      joined(); broadcast(room); return;
    }

    if (!room || !me || !rooms.has(room.code)) return fail('You are not in a room.');
    const g = room.game;

    switch (m.t) {
      case 'addBot':
        if (!isHost(room, me) || g) return;
        if (room.players.length >= MAX_PLAYERS) return fail('Room is full.');
        addBot(room);
        break;
      case 'kick': {
        if (!isHost(room, me) || g || m.id === me.id) return;
        const target = room.players.find((p) => p.id === m.id);
        if (!target) return;
        if (target.ws) send(target.ws, { t: 'kicked' });
        removePlayer(room, m.id);
        break;
      }
      case 'start':
        if (!isHost(room, me) || g) return;
        if (room.players.length < 2) return fail('Need at least 2 players (add a bot!).');
        room.mode = E.MODES.includes(m.mode) ? m.mode : 'standard';
        room.game = E.createGame(room.players, { mode: room.mode });
        room.chat = room.chat.slice(-20);
        break;
      case 'action': {
        if (!g) return;
        const idx = g.players.findIndex((p) => p.id === me.id);
        const err = E.act(g, idx, m.action);
        if (err) return fail(err);
        clearTimeout(room.botTimer); room.botTimer = null;
        break;
      }
      case 'next':
        if (!isHost(room, me)) return;
        return advance(room);
      case 'lobby':
        if (!isHost(room, me) || !g || g.phase !== 'gameover') return;
        clearTimers(room); room.game = null;
        // drop humans who never came back
        room.players.filter((p) => !p.isBot && !p.connected).forEach((p) => removePlayer(room, p.id));
        break;
      case 'chat':
        if (!String(m.text || '').trim()) return;
        pushChat(room, me.name, String(m.text).trim());
        break;
      case 'leave':
        leave();
        return;
      default:
        return;
    }
    if (rooms.has(room.code)) broadcast(room);
  });

  function leave() {
    if (!room || !me) return;
    const r = room, p = me;
    room = null; me = null;
    pushChat(r, null, `${p.name} left.`);
    if (r.game) {
      // Keep their seat in the game; a bot plays it from now on.
      p.connected = false; p.ws = null; p.left = true;
      const gp = r.game.players.find((x) => x.id === p.id);
      if (gp) { gp.isBot = true; gp.name = p.name + ' (bot)'; }
      if (r.hostId === p.id) {
        const next = r.players.find((x) => !x.isBot && x.connected);
        r.hostId = next ? next.id : null;
      }
      if (!r.players.some((x) => !x.isBot && x.connected)) { clearTimers(r); rooms.delete(r.code); return; }
    } else {
      removePlayer(r, p.id);
    }
    if (rooms.has(r.code)) broadcast(r);
  }

  ws.on('close', () => {
    if (!room || !me || me.ws !== ws) return;
    const r = room, p = me;
    p.connected = false; p.ws = null;
    if (r.hostId === p.id) {
      const next = r.players.find((x) => !x.isBot && x.connected);
      if (next) r.hostId = next.id;
    }
    // In the lobby, free the seat if they don't come back soon.
    p.dropTimer = setTimeout(() => {
      if (!p.connected && rooms.has(r.code) && !r.game) { removePlayer(r, p.id); if (rooms.has(r.code)) broadcast(r); }
    }, 45000);
    broadcast(r);
  });
});

// Keep connections alive and clean up abandoned rooms.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
  const now = Date.now();
  rooms.forEach((r, code) => {
    const anyone = r.players.some((p) => !p.isBot && p.connected);
    if (!anyone && now - r.lastActive > 10 * 60 * 1000) { clearTimers(r); rooms.delete(code); }
  });
}, 30000);

server.listen(PORT, () => console.log(`Liar's Dice running at http://localhost:${PORT}`));
