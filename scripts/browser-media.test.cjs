const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sourcePath, bufferedDuration } = require('./browser-media.cjs');
const hash = 'a'.repeat(40);
test('only existing TorrServer media routes can reach the converter', () => {
  assert.equal(sourcePath(`/offline/stream/${hash}/1/Movie.mkv`), `/offline/stream/${hash}/1/Movie.mkv`);
  assert.equal(sourcePath(`/stream/Movie.mkv?link=${hash}&index=1&play`), `/stream/Movie.mkv?link=${hash}&index=1&play`);
  for (const value of ['file:///etc/passwd', '//other.example/video', '/settings', `/stream/file?link=${hash}&index=-1`, `/stream/file?link=${hash}&index=1&redirect=http://other.example`])
    assert.throws(() => sourcePath(value));
});
test('buffer duration survives rolling playlists without double counting or assuming exact segment lengths', () => {
  const initial = '#EXTM3U\n#EXTINF:4.004,\nsegment000000.ts\n#EXTINF:3.996,\nsegment000001.ts\n';
  const first = bufferedDuration(initial);
  assert.equal(first.duration, 8);
  assert.deepEqual(bufferedDuration(initial, first), first);
  const next = bufferedDuration('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:3.996,\nsegment000001.ts\n#EXTINF:4.046,\nsegment000002.ts\n', first);
  assert.equal(next.duration, 12.046);
  assert.equal(next.sequence, 2);
});
