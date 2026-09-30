#!/usr/bin/env node
// Temporary browser review of web/build against an existing TorrServer API.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const build = path.resolve(__dirname, '../web/build');
const upstream = new URL(process.env.TORRSERVER_URL || 'http://127.0.0.1:8090');
const media = require('./browser-media.cjs')(upstream);
const hosts = (process.env.PREVIEW_HOSTS || '127.0.0.1').split(',').map(value => value.trim());
const port = Number(process.env.PREVIEW_PORT || 8097);
const ttl = Number(process.env.PREVIEW_HOURS || 8) * 3600000;
const allowedHosts = new Set(hosts.map(host => `${host}:${port}`));
if (hosts.includes('127.0.0.1')) allowedHosts.add(`localhost:${port}`);
if (!fs.existsSync(path.join(build, 'index.html'))) throw new Error('Build web/ before starting the preview');
if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password)
  throw new Error('TORRSERVER_URL must be an HTTP(S) origin without credentials');
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isFinite(ttl) || ttl <= 0)
  throw new Error('Invalid preview port or lifetime');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};
const api = /^\/(?:torrents|torrent|offline|discover|posters|stream|echo|settings|tmdb|viewed|cache|torznab|search|storage|ffp|play|playlist|playlistall|shutdown|download)(?:\/|$)/;
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
function headersWithoutHop(headers) {
  const excluded = new Set([...hopHeaders, ...(headers.connection || '').toLowerCase().split(',').map(s => s.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !excluded.has(key)));
}
function fail(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}
async function handle(req, res) {
  if (!allowedHosts.has(req.headers.host)) return fail(res, 403, 'Unknown preview host');
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) return fail(res, 405, 'Method not allowed');
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
    return fail(res, 403, 'Cross-origin writes are not allowed');
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://preview.invalid').pathname); }
  catch { return fail(res, 400, 'Invalid URL'); }

  if (await media.handle(req, res, pathname)) return;

  if (api.test(pathname)) {
    const transport = upstream.protocol === 'https:' ? https : http;
    const headers = { ...headersWithoutHop(req.headers), host: upstream.host };
    let response;
    const request = transport.request({
      protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port,
      path: req.url, method: req.method, headers,
    }, result => {
      response = result;
      res.writeHead(result.statusCode, { ...headersWithoutHop(result.headers), 'Cache-Control': 'no-store' });
      result.on('error', () => res.destroy());
      result.pipe(res);
    });
    request.setTimeout(30000, () => request.destroy(new Error('Upstream idle timeout')));
    request.on('error', () => fail(res, 502, 'TorrServer is temporarily unavailable'));
    req.on('aborted', () => request.destroy());
    res.on('close', () => { request.destroy(); response?.destroy(); });
    req.pipe(request);
    return;
  }
  if (req.method === 'POST') return fail(res, 405, 'Method not allowed');
  const target = path.resolve(build, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!target.startsWith(build + path.sep)) return fail(res, 403, 'Invalid path');
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) return fail(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

const servers = hosts.map(host => {
  const server = http.createServer(handle);
  server.on('error', error => { console.error(error.message); process.exit(1); });
  server.listen(port, host, () => console.log(`Preview: http://${host}:${port}`));
  return server;
});
function stop() {
  media.close();
  for (const server of servers) { server.close(); server.closeAllConnections(); }
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setTimeout(stop, ttl).unref();
console.log(`Temporary review: expires in ${ttl / 3600000} hours; user actions use the existing TorrServer API.`);
