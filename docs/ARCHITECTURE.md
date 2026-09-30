# Architecture

The Go server owns configuration, torrent state, metadata search, cached pieces
and offline download manifests. HTTP routes expose these operations to clients.
The React UI talks to that API at its current origin by default. It does not
contain a bundled movie catalog or server credentials.

Offline storage is a server feature: selected torrent files download into the
configured library path. Completed files can be served directly, with HTTP range
support, independently of the piece cache used for ordinary P2P playback.

The optional browser media worker is a separate Node.js process. FFmpeg produces
browser-compatible streams where direct playback is unsuitable. Its sessions
and scratch files are runtime state, never part of the source release.

The TV client bundles the compiled web UI for navigation and uses Media3 for
playback. FFmpeg software audio decoding is an optional local module inside that
client; it does not imply server-side video transcoding. Native bridge source,
upstream version and component licenses remain in `android-tv/decoder-ffmpeg/`.

`gen_web.go` is the bridge between the UI build and the Go server: it copies one
fresh UI build into an ignored generated package and emits embed bindings and
routes. Always rebuild the UI before generating a distributable server. The
preview build helper intentionally retains earlier chunks while a development
preview is open; those accumulated preview chunks are not a release input.
