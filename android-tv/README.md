# TorrServer TV

This is the existing Android TV client of the TorrServer mod fork.
Version **0.2.10**, version code **12**. Package namespace remains
`home.jetnest.torrservertv`; debug builds use the `.preview` suffix.

The library UI is bundled from `web/build`. Media3 handles playback, with
hardware video decoding and an FFmpeg software audio fallback. D-pad focus,
track selection, resume position, offline streaming and frame-rate matching
are implemented in the existing sources. Hardware behaviour varies by device.

## Build

Requirements: JDK 17, Android SDK platform 35, Android NDK r26b and the
Gradle 8.9 wrapper. `ANDROID_HOME` selects the SDK; `ANDROID_NDK_HOME` may select
the NDK. The decoder module downloads FFmpeg 6.1.6 with a pinned checksum.

Build the web UI first using the root `build-all.sh`, or:

```sh
cd web
yarn install --frozen-lockfile
NODE_OPTIONS=--openssl-legacy-provider GENERATE_SOURCEMAP=false REACT_APP_SERVER_HOST= yarn build
cd ../android-tv
./gradlew --no-daemon assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.
No signing key, local SDK properties, APK or native decoder binary is committed.
Read the [decoder README](decoder-ffmpeg/README.md) and included licenses.

## Configuration and controls

On the first launch, open **Settings** on the connection error screen and enter
your own TorrServer HTTP(S) URL. The public default is the reserved example
`http://torrserver.example:8090`. No real server or device address is bundled.

Arrows move focus; Center/Enter activates an action. During playback, Left/Right
seek, Up reveals player controls, Menu opens track options and Back closes the
current dialog or returns to the library. Preferences and resume data stay on
the device. The server URL can also be changed from the library Settings menu.

This source publication does not certify a specific TV device, HDMI receiver,
codec, HDR mode or cadence. The existing tests are retained for later controlled
device validation; no new Android runtime checks were performed for publication.
