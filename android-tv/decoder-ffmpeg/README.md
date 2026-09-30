# Software audio decoding

This local module adds Media3's FFmpeg audio renderer to the TV player. Android
decoders and working AC3/EAC3 passthrough keep priority. Unsupported formats such
as DTS, DTS-HD and TrueHD fall back to FFmpeg and PCM output. Video stays on the
existing hardware renderer; there is no server transcoding or media-file rewrite.

The Java audio classes, package annotations and JNI bridge come from
[`androidx/media` tag `1.5.1`](https://github.com/androidx/media/tree/1.5.1/libraries/decoder_ffmpeg),
under the included Apache 2.0 `LICENSE`. The unused experimental video renderer
is omitted. The Android manifest uses the Gradle namespace instead of its removed
`package` attribute. The Java and JNI audio sources are otherwise unchanged.

`build-native.sh` downloads FFmpeg **6.1.6** from `ffmpeg.org`, verifies its pinned
SHA-256 and builds only the audio decoders listed in the script, plus their
dependencies and resampling. GPL and nonfree components are not enabled; the
result reports **LGPL version 2.1 or later**, included in `LICENSE-FFmpeg`.
Source and native intermediates are under this module's standard `build/` tree.
The FFmpeg archive and exact build configuration remain available there for
rebuilding/relinking; no generated binary is a source dependency.

Build prerequisites: Android SDK 35, JDK 17, Android NDK r26b, make, curl, tar,
shasum. `ANDROID_NDK_HOME` may point to r26b; otherwise the script expects
`$ANDROID_HOME/ndk/android-ndk-r26b`. The Gradle `preBuild` task builds the native
library for **armeabi-v7a and arm64-v8a**. X98 S500 uses the former. x86 emulator
ABIs are not packaged.

The JNI bridge uses installed FFmpeg headers, avoiding the release archive's
`version` file shadowing the C++ standard `<version>` header on macOS.

Build from `android-tv/` as documented in its README. Do not upgrade the Java/JNI
bridge independently of Media3. After any decoder/NDK update, run
`PlayerDeviceTest#testEveryAudioTrackDecodesAndSeeks` on the actual TV device with
the affected film URL and its independently measured audio-track count. Decoder
and AudioTrack counters do not replace a physical HDMI listening check.
