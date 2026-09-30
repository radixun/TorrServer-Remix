#!/usr/bin/env node
// Permanent loopback service. The TorrServer route supplies authentication and origin checks.
const http = require('node:http');
const upstream = new URL(process.env.TORRSERVER_URL || 'http://127.0.0.1:8090');
const port = Number(process.env.BROWSER_MEDIA_PORT || 8098);
if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1' || upstream.username || upstream.password)
  throw new Error('TORRSERVER_URL must be a loopback HTTP origin without credentials');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid media service port');
const media = require('./browser-media.cjs')(upstream);
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"status":"ready"}'); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (!(await media.handle(req, res, pathname))) { res.writeHead(404); res.end(); }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.on('error', () => { media.close(); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Browser media listening on 127.0.0.1:${port}`));
function stop() {
  server.close(); server.closeAllConnections(); media.close(); process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
