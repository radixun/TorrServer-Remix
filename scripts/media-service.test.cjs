// Integration test: run on the Linux test host with Node 18+ and FFmpeg 6.1+.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { videoOptions } = require('./browser-media.cjs');

test('VAAPI keeps unsupported H.264 Hi10P on software decoding', () => {
  assert.ok(videoOptions('h264_vaapi', { codec_name: 'hevc', profile: 'Main 10' }).input.includes('-hwaccel'));
  const hi10 = videoOptions('h264_vaapi', { codec_name: 'h264', pix_fmt: 'yuv420p10le' });
  assert.ok(!hi10.input.includes('-hwaccel'));
  assert.ok(hi10.output.some(value => value.includes('hwupload')));
});

test('permanent Linux service prepares video, audio, captions, seeks and closes sessions', { timeout: 60000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torrserver-media-test-'));
  let source, worker;
  t.after(async () => {
    if (worker && worker.exitCode === null) { const closed = once(worker, 'exit'); worker.kill('SIGTERM'); await closed; }
    if (source) { source.closeAllConnections(); source.close(); }
    try {
      assert.equal(fs.readdirSync(dir).filter(name => name.startsWith('torrserver-browser-')).length, 0, 'cache removed on shutdown');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  const caption = path.join(dir, 'captions.srt');
  const file = path.join(dir, 'sample.mkv');
  fs.writeFileSync(caption, '1\n00:00:01,000 --> 00:00:03,000\nCaption test\n\n2\n00:00:08,000 --> 00:00:10,000\nAfter seek\n');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-f', 'lavfi', '-i', 'sine=frequency=880', '-i', caption,
    '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s', '-t', '12',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-c:s', 'srt',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=rus', file]);
  const size = fs.statSync(file).size;
  source = http.createServer((req, res) => {
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/x-matroska', 'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
  }).listen(0, '127.0.0.1');
  await once(source, 'listening');
  const reservation = http.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  worker = spawn(process.execPath, [path.join(__dirname, 'media-service.cjs')], { env: {
    ...process.env, TMPDIR: dir, TORRSERVER_URL: `http://127.0.0.1:${source.address().port}`,
    BROWSER_MEDIA_PORT: String(port), BROWSER_VIDEO_ENCODER: 'libx264',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  await once(worker.stdout, 'data');
  const base = `http://127.0.0.1:${port}`;
  const post = (url, data) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/settings')).status, 404);
  assert.equal((await post('/browser-media/session', { source: 'file:///etc/passwd' })).status, 502);
  const request = { source: `/stream/sample.mkv?link=${'a'.repeat(40)}&index=1&play`, language: 'rus' };
  const created = await post('/browser-media/session', request);
  assert.equal(created.status, 201);
  let session = await created.json();
  assert.equal(session.audios.find(track => track.index === session.audio).language, 'rus');
  const playlist = await fetch(base + session.url);
  assert.equal(playlist.status, 200);
  const manifest = await playlist.text();
  const segmentName = /segment\d+\.ts/.exec(manifest)?.[0];
  assert.ok(segmentName, manifest);
  const segment = await fetch(base + session.url.replace('index.m3u8', segmentName));
  assert.ok((await segment.arrayBuffer()).byteLength > 1000);
  const captionURL = base + session.url.replace('index.m3u8', `subtitle${session.subtitles[0].index}.vtt`);
  let captions = '';
  for (let i = 0; i < 30 && !captions.includes('Caption test'); i++) {
    captions = await (await fetch(captionURL)).text(); await delay(100);
  }
  assert.ok(captions.includes('Caption test'), captions);
  const oldURL = session.url;
  const english = session.audios.find(track => track.language === 'eng').index;
  session = await (await post(`/browser-media/${session.id}/control`, { seek: 6, audio: english })).json();
  assert.equal(session.offset, 6);
  assert.equal(session.audio, english);
  assert.notEqual(session.url, oldURL);
  assert.equal((await fetch(base + oldURL)).status, 404);
  assert.equal((await fetch(base + session.url)).status, 200);
  const second = await (await post('/browser-media/session', request)).json();
  assert.equal((await post('/browser-media/session', request)).status, 429);
  await post(`/browser-media/${second.id}/close`, {});
  await post(`/browser-media/${session.id}/close`, {});
  assert.equal((await fetch(base + session.url)).status, 404);
});
