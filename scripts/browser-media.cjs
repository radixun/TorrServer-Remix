// Browser compatibility: bounded FFmpeg sessions, HLS and text captions.
// The native TV player keeps the original stream. No media is written to the library.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const textCodecs = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
function bufferedDuration(playlist, previous = { sequence: -1, duration: 0 }) {
  let { sequence, duration } = previous;
  for (const match of playlist.matchAll(/#EXTINF:([\d.]+),[^\n]*\nsegment(\d+)\.ts/g)) {
    const next = Number(match[2]);
    if (next > sequence) { duration += Number(match[1]); sequence = next; }
  }
  return { sequence, duration };
}
function sourcePath(value) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//'))
    throw new Error('Invalid media source');
  const url = new URL(value, 'http://media.invalid');
  const disk = /^\/offline\/stream\/[a-f0-9]{40}\/\d+\/[^/]+$/i.test(url.pathname);
  const online = /^\/stream\/[^/]+$/.test(url.pathname) && /^[a-f0-9]{40}$/i.test(url.searchParams.get('link') || '') &&
    /^[1-9]\d*$/.test(url.searchParams.get('index') || '') && [...url.searchParams.keys()].every(key => ['link', 'index', 'play'].includes(key));
  if (!disk && !online) throw new Error('Invalid media source');
  return url.pathname + url.search;
}
function videoOptions(encoder, video = {}) {
  if (encoder !== 'h264_vaapi') return {
    input: [],
    output: ['-vf', "scale=w='min(1920,iw)':h=-2,format=yuv420p", '-c:v', encoder,
      ...(encoder === 'libx264' ? ['-preset', 'veryfast', '-crf', '21'] : ['-b:v', '6500k', '-allow_sw', '1'])],
  };
  // Kaby Lake can decode ordinary H.264 and HEVC Main/Main10, but not H.264 Hi10P.
  // Other formats keep software decoding and still use the GPU for scaling/encoding.
  const hardwareDecode = (video.codec_name === 'hevc' && ['Main', 'Main 10'].includes(video.profile)) ||
    (video.codec_name === 'h264' && video.pix_fmt === 'yuv420p') || video.codec_name === 'mpeg2video';
  return {
    input: ['-vaapi_device', process.env.BROWSER_VAAPI_DEVICE || '/dev/dri/renderD128',
      ...(hardwareDecode ? ['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi'] : [])],
    output: ['-vf', `${hardwareDecode ? '' : 'format=nv12,hwupload,'}scale_vaapi=w='min(1920,iw)':h=-2:format=nv12`,
      '-c:v', 'h264_vaapi', '-profile:v', 'high', '-bf', '0', '-b:v', '6500k', '-maxrate', '8500k', '-bufsize', '13000k'],
  };
}
function run(binary, args, timeout = 25000, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', data => { bytes += data.length; if (bytes > 8 * 1024 * 1024) abort(); else chunks.push(data); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(signal?.aborted ? 'Cancelled' : `Media preparation failed${stderr.includes('timed out') ? ': source timeout' : ''}`));
    });
  });
}

module.exports = function browserMedia(upstream) {
  const sessions = new Map(); let pending = 0;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'torrserver-browser-'));
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const ffprobe = process.env.FFPROBE || 'ffprobe';
  const encoder = process.env.BROWSER_VIDEO_ENCODER || (process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264');
  function stopCaptions(session) {
    session.caption?.worker.kill('SIGKILL');
    session.caption = null;
  }
  function prepareCaptions(session, index) {
    if (session.caption?.index === index) return;
    stopCaptions(session);
    const file = path.join(session.dir, String(session.generation), `subtitle${index}.vtt`);
    fs.writeFileSync(file, 'WEBVTT\n\n');
    const start = Math.max(session.offset, session.position - 2);
    // Sparse/forced tracks must never hold up the video muxer. Read only the chosen
    // track, paced near playback rather than scanning far ahead through the torrent.
    const worker = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-rw_timeout', '20000000',
      '-readrate', '1', '-readrate_initial_burst', '40', '-ss', String(start), '-i', session.source,
      '-map', `0:${index}`, '-c:s', 'webvtt', '-output_ts_offset', String(start - session.offset),
      '-f', 'webvtt', '-flush_packets', '1', file], { stdio: ['ignore', 'ignore', 'ignore'] });
    const caption = { index, worker, stopped: false, error: false };
    session.caption = caption;
    worker.on('error', () => { caption.error = true; });
    worker.on('close', code => { if (code !== 0) caption.error = true; });
  }
  function remove(id) {
    const session = sessions.get(id);
    if (!session) return;
    session.closed = true;
    session.worker?.kill('SIGKILL');
    stopCaptions(session);
    session.abort.abort();
    sessions.delete(id);
    // Wait for the process to release its output before removing its private cache.
    const clean = () => fsp.rm(session.dir, { recursive: true, force: true }).catch(() => {});
    if (session.worker && session.worker.exitCode === null) session.worker.once('close', clean);
    else clean();
  }
  function start(session, offset, audio) {
    session.worker?.kill('SIGKILL');
    stopCaptions(session);
    const generation = ++session.generation;
    const dir = path.join(session.dir, String(generation)); fs.mkdirSync(dir);
    session.offset = Math.max(0, Math.min(session.duration - 1, offset || 0));
    session.audio = session.audios.find(track => track.index === audio)?.index ?? session.audios[0]?.index;
    session.position = session.offset; session.buffer = { sequence: -1, duration: 0 }; session.paused = false; session.stopped = false; session.error = '';
    const video = videoOptions(encoder, session.video);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-rw_timeout', '20000000', ...video.input,
      '-ss', String(session.offset), '-i', session.source, '-map', '0:v:0'];
    if (session.audio !== undefined) args.push('-map', `0:${session.audio}`);
    args.push('-sn', '-dn', ...video.output);
    args.push('-force_key_frames', 'expr:gte(t,n_forced*4)', '-c:a', 'aac', '-ac', '2', '-b:a', '192k',
      '-f', 'hls', '-hls_time', '4', '-hls_list_size', '60', '-hls_delete_threshold', '2',
      '-hls_flags', 'delete_segments+independent_segments+temp_file', '-hls_segment_filename', path.join(dir, 'segment%06d.ts'),
      path.join(dir, 'index.m3u8'));
    const worker = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    session.worker = worker;
    worker.stderr.on('data', () => {}); // No raw source URLs in logs or API errors.
    worker.on('error', () => { if (session.generation === generation) session.error = 'FFmpeg is unavailable'; });
    worker.on('close', code => { if (session.generation === generation && code !== 0 && !session.closed) session.error = 'Video conversion failed'; });
    // Old generations are inaccessible after a seek; reclaim them once their process exits.
    for (const entry of fs.readdirSync(session.dir)) if (entry !== String(generation))
      fsp.rm(path.join(session.dir, entry), { recursive: true, force: true }).catch(() => {});
  }
  const monitor = setInterval(() => {
    for (const session of sessions.values()) {
      if (Date.now() - session.touched > 45000) { remove(session.id); continue; }
      // FFmpeg's global progress includes subtitle timestamps far ahead of video.
      // Throttle only from completed HLS segments, accumulating their real duration.
      try {
        session.buffer = bufferedDuration(fs.readFileSync(path.join(session.dir, String(session.generation), 'index.m3u8'), 'utf8'), session.buffer);
      } catch (_) { /* The first playlist may still be preparing. */ }
      const ahead = session.buffer.duration - (session.position - session.offset);
      const stop = session.paused || ahead > (session.stopped ? 28 : 44);
      if (stop !== session.stopped && session.worker?.exitCode === null) {
        session.worker.kill(stop ? 'SIGSTOP' : 'SIGCONT'); session.stopped = stop;
      }
      const stopCaption = session.paused || session.buffering;
      if (session.caption && stopCaption !== session.caption.stopped && session.caption.worker.exitCode === null) {
        session.caption.worker.kill(stopCaption ? 'SIGSTOP' : 'SIGCONT'); session.caption.stopped = stopCaption;
      }
    }
  }, 1000).unref();
  const describe = session => ({ id: session.id, duration: session.duration, offset: session.offset, audio: session.audio,
    audios: session.audios, subtitles: session.subtitles, error: session.error,
    url: `/browser-media/${session.id}/${session.generation}/index.m3u8` });
  async function body(req) {
    let data = '';
    for await (const chunk of req) { data += chunk; if (data.length > 8192) throw new Error('Request too large'); }
    return JSON.parse(data || '{}');
  }
  function json(res, status, value) {
    if (res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
  }
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/browser-media/')) return false;
    const abort = new AbortController(); res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      if (pathname === '/browser-media/session' && req.method === 'POST') {
        if (sessions.size + pending >= 2) { json(res, 429, { error: 'Two browser players are already open. Close one and retry.' }); return true; }
        pending++;
        try {
          const data = await body(req);
          const source = new URL(sourcePath(data.source), upstream).toString();
          const info = JSON.parse(await run(ffprobe, ['-v', 'error', '-rw_timeout', '20000000', '-analyzeduration', '3000000', '-probesize', '4000000',
            '-show_entries', 'format=duration:stream=index,codec_name,codec_type,profile,pix_fmt:stream_tags=language,title', '-of', 'json', source], 25000, abort.signal));
          const duration = Number(info.format?.duration);
          if (!Number.isFinite(duration) || duration <= 0 || !info.streams?.some(track => track.codec_type === 'video')) throw new Error('No playable video found');
          if (abort.signal.aborted) return true;
          const tracks = kind => info.streams.filter(track => track.codec_type === kind).map(track => ({ index: track.index,
            language: track.tags?.language || 'und', label: track.tags?.title || track.tags?.language || track.codec_name,
            supported: kind !== 'subtitle' || textCodecs.has(track.codec_name) }));
          const id = randomUUID(); const dir = path.join(root, id); fs.mkdirSync(dir);
          const session = { id, dir, source, duration, video: info.streams.find(track => track.codec_type === 'video'),
            audios: tracks('audio'), subtitles: tracks('subtitle'), generation: 0, touched: Date.now(), abort: new AbortController() };
          sessions.set(id, session);
          const preferred = session.audios.find(track => track.language === data.language)?.index;
          start(session, Number(data.position) || 0, preferred);
          json(res, 201, describe(session));
        } finally { pending--; }
        return true;
      }
      const parts = pathname.split('/'); const session = sessions.get(parts[2]);
      if (!session) { json(res, 404, { error: 'Playback session expired. Open the player again.' }); return true; }
      session.touched = Date.now();
      if (parts[3] === 'close' && req.method === 'POST') { remove(session.id); json(res, 200, {}); return true; }
      if (parts[3] === 'control' && req.method === 'POST') {
        const data = await body(req);
        if (Number.isFinite(data.seek) || (Number.isInteger(data.audio) && data.audio !== session.audio))
          start(session, Number.isFinite(data.seek) ? data.seek : session.position, data.audio ?? session.audio);
        if (Number.isFinite(data.position)) session.position = Math.max(session.offset, Math.min(session.duration, data.position));
        if ('paused' in data) session.paused = !!data.paused;
        if ('buffering' in data) session.buffering = !!data.buffering;
        if (Number.isInteger(data.subtitle) && (data.subtitle < 0 || data.subtitle !== session.caption?.index || session.caption?.error)) stopCaptions(session);
        json(res, 200, describe(session)); return true;
      }
      const subtitleIndex = /^subtitle(\d+)\.vtt$/.exec(parts[4] || '');
      const validSubtitle = subtitleIndex && session.subtitles.some(track => track.index === Number(subtitleIndex[1]) && track.supported);
      if (req.method !== 'GET' || parts.length !== 5 || Number(parts[3]) !== session.generation || (!/^(index\.m3u8|segment\d{6}\.ts)$/.test(parts[4]) && !validSubtitle)) {
        json(res, 404, { error: 'Not found' }); return true;
      }
      const file = path.join(session.dir, parts[3], parts[4]); const deadline = Date.now() + 25000;
      if (validSubtitle) {
        prepareCaptions(session, Number(subtitleIndex[1]));
        if (session.caption.error) throw new Error('Could not prepare subtitles. Select the track again to retry.');
        let content = '';
        try { content = await fsp.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        // FFmpeg flushes a cue with one trailing newline; the separating blank
        // line arrives with the next cue, which may be minutes away on a forced track.
        content = content.endsWith('\n') ? content + '\n' : content.slice(0, content.lastIndexOf('\n\n') + 2);
        res.writeHead(200, { 'Content-Type': 'text/vtt', 'Cache-Control': 'no-store' });
        res.end(content.startsWith('WEBVTT') ? content : 'WEBVTT\n\n'); return true;
      }
      while (!fs.existsSync(file)) {
        if (abort.signal.aborted || session.closed) return true;
        if (session.error || Date.now() > deadline) throw new Error(session.error || 'Source is too slow to prepare video');
        await sleep(150);
      }
      if (parts[4] === 'index.m3u8') {
        const playlist = (await fsp.readFile(file, 'utf8')).replace('#EXTM3U\n', '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES\n');
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }); res.end(playlist);
      } else {
        const stat = await fsp.stat(file);
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': stat.size, 'Cache-Control': 'private, max-age=300' });
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
      }
    } catch (error) { if (!res.headersSent) json(res, 502, { error: error.message }); else res.destroy(); }
    return true;
  }
  return { handle, close() { clearInterval(monitor); for (const id of sessions.keys()) remove(id); fs.rmSync(root, { recursive: true, force: true }); } };
};
module.exports.sourcePath = sourcePath;
module.exports.bufferedDuration = bufferedDuration;
module.exports.videoOptions = videoOptions;
