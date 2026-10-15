// Multiplayer relay. It does not run any game logic: it groups sockets into
// rooms (identified by a 4-letter code) and forwards messages between the
// room's host and its clients. The host's browser runs the simulation.
//
// Wire protocol
//   connect   /mp?create=1        -> you are the host of a new room
//             /mp?join=CODE       -> you join that room as a client
//   server -> anyone   {"t":"welcome","id":N,"code":"ABCD","host":bool}
//   server -> host     {"t":"peer-join","id":N} / {"t":"peer-leave","id":N}
//   server -> clients  {"t":"host-left"}
//   client -> server   any JSON text; delivered to the host as {"from":id,"m":<json>}
//   host   -> server   JSON {"to": id | "all", "m": <json>}   (forwarded as <json>)
//                      binary [targetId:u8][payload...]       (255 = all clients)

import { WebSocketServer } from 'ws';

const MAX_PLAYERS = 4;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion with 1/0

// Limits for running on the public internet.
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP) || 16;
const CLIENT_MSGS_PER_SEC = 100; // clients send ~30 input messages/s
const HEARTBEAT_MS = 30000;

const rooms = new Map();
const socketsPerIp = new Map();

export function relayStats() {
  let players = 0;
  for (const r of rooms.values()) players += 1 + r.clients.size;
  return { rooms: rooms.size, players };
}

function clientIp(req) {
  // Behind a hosting proxy (Render, Fly, ...) the real address is forwarded.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

// Token bucket: returns false when a socket sends faster than allowed.
function rateLimiter(perSec) {
  let tokens = perSec;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(perSec, tokens + ((now - last) / 1000) * perSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function onConnection(ws, url) {
  ws.binaryType = 'nodebuffer';
  const joinCode = (url.searchParams.get('join') || '').toUpperCase();

  if (url.searchParams.has('create')) {
    if (rooms.size >= MAX_ROOMS) {
      sendJson(ws, { t: 'error', msg: 'The server is full, try again later' });
      ws.close();
      return;
    }
    const code = newCode();
    const room = { code, host: ws, clients: new Map(), nextId: 1 };
    rooms.set(code, room);
    sendJson(ws, { t: 'welcome', id: 0, code, host: true });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const target = data[0];
        const payload = data.subarray(1);
        if (target === 255) for (const c of room.clients.values()) c.readyState === c.OPEN && c.send(payload);
        else {
          const c = room.clients.get(target);
          if (c && c.readyState === c.OPEN) c.send(payload);
        }
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.to === 'kick') {
        room.clients.get(msg.id)?.close(4001, msg.reason || 'kicked');
        return;
      }
      const text = JSON.stringify(msg.m);
      if (msg.to === 'all') for (const c of room.clients.values()) c.readyState === c.OPEN && c.send(text);
      else {
        const c = room.clients.get(msg.to);
        if (c && c.readyState === c.OPEN) c.send(text);
      }
    });
    ws.on('close', () => {
      rooms.delete(code);
      for (const c of room.clients.values()) {
        sendJson(c, { t: 'host-left' });
        c.close();
      }
    });
    return;
  }

  const room = rooms.get(joinCode);
  if (!room) {
    sendJson(ws, { t: 'error', msg: `No game with code ${joinCode || '?'}` });
    ws.close();
    return;
  }
  if (room.clients.size >= MAX_PLAYERS - 1) {
    sendJson(ws, { t: 'error', msg: 'That game is full' });
    ws.close();
    return;
  }
  const id = room.nextId++;
  room.clients.set(id, ws);
  sendJson(ws, { t: 'welcome', id, code: room.code, host: false });
  sendJson(room.host, { t: 'peer-join', id });

  const allow = rateLimiter(CLIENT_MSGS_PER_SEC);
  ws.on('message', (data, isBinary) => {
    if (isBinary || room.host.readyState !== room.host.OPEN || !allow()) return;
    const text = data.toString();
    if (text.length > 4096) return; // client messages are tiny; ignore junk
    room.host.send(`{"from":${id},"m":${text}}`);
  });
  ws.on('close', () => {
    room.clients.delete(id);
    sendJson(room.host, { t: 'peer-leave', id });
  });
}

// Attach to an existing Node http server (Vite dev/preview server, or the
// production server in server/index.js).
export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/mp') return; // leave other upgrades (Vite HMR) alone
    const ip = clientIp(req);
    const count = socketsPerIp.get(ip) || 0;
    if (count >= MAX_SOCKETS_PER_IP) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      socketsPerIp.set(ip, count + 1);
      ws.on('close', () => {
        const n = (socketsPerIp.get(ip) || 1) - 1;
        if (n <= 0) socketsPerIp.delete(ip);
        else socketsPerIp.set(ip, n);
      });
      // Heartbeat: drop sockets whose peer vanished without closing
      // (sleeping laptops, dropped mobile connections).
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      onConnection(ws, url);
    });
  });
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  beat.unref?.();
  httpServer.on('close', () => clearInterval(beat));
}

// Vite plugin so `npm run dev` / `npm run preview` serve the relay too.
export function relayPlugin() {
  return {
    name: 'vampire-thing-relay',
    configureServer(server) {
      if (server.httpServer) attachRelay(server.httpServer);
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachRelay(server.httpServer);
    },
  };
}
