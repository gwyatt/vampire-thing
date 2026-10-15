// Production server: serves the built game from dist/ and runs the co-op
// relay on the same port, so one URL is all players need.
//
//   npm run build && npm start        (PORT defaults to 8080)
//
// No dependencies beyond `ws` (used by the relay).

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { attachRelay, relayStats } from './relay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

// The game draws everything itself, so the policy can be tight: only our
// own scripts/styles/fonts, plus data:/blob: images Phaser uses internally
// and same-origin WebSockets for co-op.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' data: blob:; object-src 'none'; " +
    "base-uri 'self'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const gzCache = new Map(); // file path -> gzipped Buffer (dist/ is immutable)

async function serveFile(req, res, file) {
  const ext = path.extname(file);
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Vite fingerprints everything under assets/, so it can be cached forever.
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
  };
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && acceptsGzip) {
    let gz = gzCache.get(file);
    if (!gz) {
      gz = gzipSync(await readFile(file), { level: 9 });
      gzCache.set(file, gz);
    }
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length });
    res.end(req.method === 'HEAD' ? undefined : gz);
    return;
  }
  const { size } = await stat(file);
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

function sendText(res, code, text) {
  res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, ...relayStats() }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'Method not allowed');
      return;
    }
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (rel.includes('\0')) {
      sendText(res, 400, 'Bad request');
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel));
    // Never serve anything outside dist/
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      sendText(res, 403, 'Forbidden');
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }
    await serveFile(req, res, file);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, 'Server error');
    else res.destroy();
  }
});

attachRelay(server);

stat(path.join(ROOT, 'index.html'))
  .catch(() => {
    console.error(`No build found in ${ROOT}. Run "npm run build" first.`);
    process.exit(1);
  })
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Vampire Thing running at http://localhost:${PORT} (listening on ${HOST}:${PORT})`);
    });
  });

// Let hosting platforms stop us cleanly on redeploy.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
