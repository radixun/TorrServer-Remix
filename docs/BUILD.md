# Build and Configuration

## Server and web interface

Run `./build-all.sh` from the repository root. It installs dependencies using
`web/yarn.lock`, makes a fresh web build, generates the Go embed package, and
builds the selected server targets. Go dependencies are pinned in `server/go.mod`
and `server/go.sum`. The build uses `nosqlite` and does not install a service.
It does not modify a server database or upload any artifacts.

Run a built server only on the intended host. Supply configuration and library
paths at runtime. Use `--help` on that host for supported options. The inherited
systemd unit `torrserver.service` is an example; adjust paths, user and authentication
before installing it. Keep databases, download directories and credentials out of Git.

## Browser media worker

The optional Node.js worker in `scripts/media-service.cjs` requires FFmpeg.
It uses `TORRSERVER_URL` (default `http://127.0.0.1:8090`),
`BROWSER_MEDIA_PORT` (default `8098`) and `BROWSER_VIDEO_ENCODER`.
Read `scripts/browser-media.cjs` for the encoder options. Intel VAAPI needs a
working render device and FFmpeg VAAPI support. Hardware availability is not
proved by a successful source build.

The files in `deploy/` are Linux systemd examples with loopback service URLs.
They assume Node.js and FFmpeg at `/usr/bin/` and an Intel render device at
`/dev/dri/renderD128`. Adapt these assumptions before use. The service is separate
from the server container. Docker builds do not provide or enable this worker.

## Temporary desktop preview

After building `web/`, start `scripts/preview-web.cjs` with `TORRSERVER_URL`
set to the server you intend to use. Default bind address is `127.0.0.1`, port
`8097`, lifetime eight hours. Stop it after development. Preview API operations
use the configured server, so choose the backend deliberately.

## TV client source build

See [android-tv/README.md](../android-tv/README.md) and the
[decoder module README](../android-tv/decoder-ffmpeg/README.md).
The TV client has independent version metadata, **0.2.10 / 12**.
The source includes existing device tests, but their presence and a build do not
establish device playback acceptance. Public source preparation does not retest
HDMI cadence, codecs or any particular device.

## macOS VLC integration

`scripts/install-macos-vlc-url-handler.sh` installs the handler under the user's
Applications directory and registers the `vlc` scheme. Review it before running;
it replaces an existing handler of the same name. This installation is optional
and is not performed by the server build.

## Container build

`docker build -t torrserver-mod .` builds the server from the local source tree.
The Dockerfile provides FFmpeg for backend probing; browser conversion still
needs its separate Node worker. Container build/runtime checks are separate
from the documented local source build and must run on a suitable test host.

## Validation scope

The initial public tree is a source snapshot, not a new playback release.
Source checks and desktop browser tests must not be presented as acceptance of
all server platforms, Android TV devices or media formats. Keep test runtime
state and credentials in ignored local paths.
