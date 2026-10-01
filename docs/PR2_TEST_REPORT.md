# PR #2 functional validation

Validation date: 2026-10-01. PR: https://github.com/radixun/TorrServer-Remix/pull/2.
The starting PR head was `a3385fdc53120bbea519943e5d6984e03c246293`.
Results below include the follow-up fixes on `codex/merge-matrix-145-1`.
Main was not merged and no production service was deployed or changed.

## Result

The tested Linux/desktop paths pass after fixing the defects below. This is
not acceptance of every platform, external service or hardware decoder.
All existing automated suites were run, alongside local server, browser,
BitTorrent, offline and container integration checks. Some modules have no
unit tests; passing the full suite does not imply exhaustive path coverage.

The tests used the isolated cloud Linux workspace, Go 1.25.13, Node 24.19.0,
Chromium, FFmpeg and a local BitTorrent seeder/tracker. Only generated media,
temporary credentials and disposable configuration were used. Diagnostics,
media, binaries and dependency caches remain ignored under `.agent-work/`.
The requested Nest access skill is not available in this session and its
connector returns HTTP 429, so Nest playback acceptance is still outstanding.

## Defects reproduced and fixed

- Legacy `wip.txt` / `bip.txt` restrictions disappeared on read-only upgrades
  because migration was skipped. WAF now reads the legacy ACL when no stored
  WAF configuration is available, without renaming or writing the files.
- Optional GStreamer `/gst/remove` allowed unauthenticated removal. It now
  requires the existing authentication middleware.
- `.torrent` files already present in the watched directory were ignored.
  Register the watcher after server initialization and scan existing files.
- The watcher called the embedded torrent's `Drop`, leaving a closed object
  in the active map; reopening returned HTTP 500. Use the server's removal
  operation. Startup and event imports, followed by repeated playback, pass.
- The merged playlist assigned file IDs using lexical ordering while playback
  used natural ordering. Both now use the same comparator; Episode2 and
  Episode10 have matching labels and playback IDs.
- HTTPS redirects double-escaped spaces, Cyrillic paths and encoded slashes.
  Preserve the request URL's Path, RawPath and RawQuery.
- Windows could not compile the offline manager's Unix `Statfs` call.
  Free-space checks now use platform-specific implementations, including
  Windows `GetDiskFreeSpaceEx`; unsupported platforms report unavailable.
- Tracker tests leaked their refresh goroutine into later tests. Give the
  refresh loop stop/completion channels, stop it in test cleanup and capture
  its interval before launching it. The race suite passes.
- Nix fetched upstream MatriX.141 rather than this fork. Build the flake's
  source, update dependency hashes and version, generate the embedded web
  package, and respect the builder's native architecture.

Regression tests cover read-only legacy ACLs, authenticated GStreamer removal,
playlist IDs and escaped redirect URLs. Existing offline tests cover free
space/storage availability, downloads, resume, deletion and traversal rejection.

## Automated and build checks

| Check | Result |
| --- | --- |
| Fresh `./build-all.sh`, embedded web and Linux/amd64 server | Pass |
| `CGO_ENABLED=0 go test -tags=nosqlite,gst -timeout=180s ./...` | Pass; 17 packages with tests |
| `CGO_ENABLED=1 go test -race -tags=nosqlite -timeout=180s ./...` | Pass; 16 packages with tests |
| `CGO_ENABLED=1 go test -timeout=180s ./...` (SQLite configuration) | Pass; 16 packages with tests |
| `CI=true yarn --cwd web test --watchAll=false --runInBand` | Pass; 9 suites, 29 tests |
| `node --test scripts/*.test.cjs` | Pass; 4 tests, including real FFmpeg integration |
| Optional GStreamer tests with `-tags=nosqlite,gst -v ./gstreamer` | Pass; no tests skipped in this environment |
| Cross-compilation: Windows/amd64, macOS/arm64, Linux/arm64, FreeBSD/amd64 | Pass; compilation only |
| Docker source pipeline and entrypoint | Source build passed before the final watcher removal fix; final Linux binary repack/startup/restart pass (see below) |
| Nix expression parsing and dependency hashes | Pass; hashes independently checked with `nix-hash`; final vendor tree unchanged |
| `git diff --check` | Pass |

Run Go commands inside `server/`. Cross-compilation uses `CGO_ENABLED=0` and
`-tags=nosqlite`. The Docker build needed an environment-only CA/proxy overlay
for this cloud's network policy; no product Dockerfile workaround was added.
The final complete source-image rebuild was blocked by Docker Hub HTTP 429
and transient build-disk exhaustion. The final `build-all.sh` binary was
repacked into the already built runtime image to check its existing entrypoint,
version/UI, settings and graceful restart. This validates the final runtime
binary but does not claim a complete final Docker source rebuild.
A complete Nix derivation build remains unverified: this host has no Nix daemon,
and loading the standalone Nix container exceeded the available build storage.

## Runtime scenarios

| Area | Checks and result |
| --- | --- |
| Server/API | Version, embedded UI, Basic Auth rejection, malformed requests, torrent add/list/edit/drop, multipart upload and cache status pass |
| Directory import | Startup import and later file event pass; input consumed, torrent remains saved, repeated reopening and streaming pass |
| BitTorrent streaming | Local tracker/seeder transfers a generated H.264/AAC MP4; full response and byte range match the source exactly; `/play` also passes |
| Playlists | Single-torrent and merged M3U pass, including Episode2/Episode10 ordering and file indices |
| Viewed history | Set/list/remove, manual browser toggles, playback marking and timecodes pass |
| Offline | Actual BitTorrent download reaches completed state; stored bytes match source; byte ranges, HTTP 416 and completed-file playback pass |
| Persistence | Restart retains saved torrents, settings, timecodes, WAF lists and offline manifests; stored media remains playable |
| WAF/settings | Whitelist/blacklist/referer update and immediate enforcement pass; settings dialog and WAF tab render |
| Cinema browser | Library/title/episode pages, watched toggles and integrated video player pass; Chromium decodes 160×90 video, pauses, seeks and resumes without page errors |
| Browser media | Live server → media proxy → FFmpeg yields HLS manifest and segments; seek and close pass; separate worker integration covers two audio languages, captions and session limits/cleanup |
| FFprobe | Probe of the live torrent returns H.264/AAC streams |
| MCP | Auth rejection, live initialization, enumeration of 14 tools, server-info/torrent-list/viewed-list calls pass; automated episode/URL tests also pass |
| Metadata/search | Automated metadata, ranked Torznab search, category compatibility and error-response tests pass; actual provider acceptance remains outstanding |

## Limits before release

These checks do not establish TV/mobile runtime acceptance, the macOS VLC URL
handler's runtime behavior, Windows/macOS/ARM runtime behavior, physical DLNA/
mDNS discovery, GPU/VAAPI decoding, external torrent discovery or public
tracker reachability. Optional GStreamer tests do not establish end-to-end
playback across real codecs and external devices. TMDB/Prowlarr/Rutor and other
live provider integrations need the maintainer's configured services; mocks
and local fixtures cannot verify their credentials or current availability.

For the default Linux server and desktop cinema workflows exercised here,
there are no remaining reproduced failures. A release that promises any of
the external/device paths above still needs acceptance on those targets.
