# TorrServer Remix by radixun

**A fork of [YouROK/TorrServer](https://github.com/YouROK/TorrServer),
maintained by [radixun](https://github.com/radixun).** This is an unofficial
modification, with its own source build; it is not an upstream TorrServer release.

The source base is **MatriX.145.1**, upstream commit
[`5b294b0b5386ba790347738ac3f80121688f5feb`](https://github.com/YouROK/TorrServer/commit/5b294b0b5386ba790347738ac3f80121688f5feb).
The existing TV client version is **0.2.10** (version code 12).
The fork build identifies the server as `MatriX.145.1-mod`; this distinguishes
modified binaries from the original version. `FORK_VERSION` can override it.

## What this fork changes

- Cinema library with poster cards, title details, search, filters and downloads.
- TMDB metadata and Torznab search integration, including error handling and
  query normalization.
- Offline file storage with resumable download state and range-based streaming.
- Optional browser media worker that uses FFmpeg to produce H.264/AAC streams.
- Android TV client with D-pad navigation and a Media3 player, including an
  FFmpeg audio decoder module. Existing sources are included; device behaviour
  depends on the device and codec support.
- Desktop VLC URL handler for macOS.

No movie library, torrents, server database, account credentials or home
infrastructure configuration is included.

## Source layout

| Path | Purpose |
| --- | --- |
| `server/` | Go backend, HTTP APIs, torrent engine and offline storage |
| `web/` | React interface, translations, fonts and public UI assets |
| `android-tv/` | TV client, Gradle wrapper and FFmpeg audio decoder sources |
| `scripts/` | Browser media worker, temporary preview and desktop integration |
| `deploy/` | Example systemd service configuration for the media worker |
| `patches/` | Patches inherited with the upstream source |
| `gen_web.go` | Generates Go embed bindings from a fresh web build |
| `build-all.sh` | Builds web assets and selected server targets from source |
| `Dockerfile` | Builds the fork server; it does not download an upstream binary |
| `docs/` | Build, architecture and fork attribution documentation |

## Build

Install Go **1.25.7 or later**, Node.js **24** and Yarn **1.22.22**.
A shell and network access to dependency registries are required.

```sh
./build-all.sh
```

The default target is Linux amd64 and the output is
`dist/TorrServer-linux-amd64`. To build for the current Mac, use
`PLATFORMS=darwin/arm64 ./build-all.sh` (or `darwin/amd64` on Intel).
Multiple targets are space separated, for example:

```sh
PLATFORMS="linux/amd64 linux/arm64" ./build-all.sh
```

Builds generate `web/build/`, `server/web/pages/template/` and `dist/`;
these outputs are excluded from Git and are regenerated from source.
See [Build and Configuration](docs/BUILD.md) for worker and TV build details,
and [Architecture](docs/ARCHITECTURE.md) for component boundaries.

The inherited upstream installers and historical auto-publish workflows are
not part of the fork distribution. They install or publish upstream versions.
There are no prebuilt fork binaries or container images implied by this README.

## License and attribution

The upstream GPLv3 license is preserved in [LICENSE](LICENSE).
Original TorrServer authors and contributors retain their attribution.
Changes in this fork, including the public source cleanup on 2026-09-30,
are described in [FORK_CHANGES.md](docs/FORK_CHANGES.md).
The original upstream readme is preserved in [UPSTREAM_README.md](docs/UPSTREAM_README.md)
for reference; its installation links refer to upstream, not this fork.

Additional components retain their own license notices: [Media3 FFmpeg bridge
(Apache 2.0)](android-tv/decoder-ffmpeg/LICENSE), [FFmpeg (LGPL 2.1 or later)](android-tv/decoder-ffmpeg/LICENSE-FFmpeg)
and [Inter font (SIL OFL 1.1)](web/src/assets/inter/LICENSE).
Native FFmpeg code is downloaded with a pinned checksum and built from source;
no compiled decoder libraries or application packages are included.
