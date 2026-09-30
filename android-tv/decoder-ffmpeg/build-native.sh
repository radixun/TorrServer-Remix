#!/usr/bin/env bash
set -euo pipefail

module_dir="$(cd "$(dirname "$0")" && pwd)"
build_dir="$module_dir/build/native"
ndk_dir="${ANDROID_NDK_HOME:-$1/ndk/android-ndk-r26b}"
case "$(uname -s)" in
  Darwin) host=darwin-x86_64 ;;
  Linux) host=linux-x86_64 ;;
  *) echo "Build on macOS or Linux with Android NDK r26b" >&2; exit 1 ;;
esac
toolchain="$ndk_dir/toolchains/llvm/prebuilt/$host/bin"
test -x "$toolchain/armv7a-linux-androideabi23-clang"
mkdir -p "$build_dir"
archive="$build_dir/ffmpeg-6.1.6.tar.xz"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 2 https://ffmpeg.org/releases/ffmpeg-6.1.6.tar.xz -o "$archive.part"
  mv "$archive.part" "$archive"
fi
echo "d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a  $archive" | shasum -a 256 --check
if [[ ! -d "$build_dir/ffmpeg-6.1.6" ]]; then
  tar -xJf "$archive" -C "$build_dir"
fi
source_dir="$build_dir/ffmpeg-6.1.6"
decoders=(aac ac3 eac3 dca mlp truehd mp3 amrnb amrwb flac alac vorbis opus pcm_mulaw pcm_alaw)
decoder_options=()
for decoder in "${decoders[@]}"; do decoder_options+=("--enable-decoder=$decoder"); done

for abi in armeabi-v7a arm64-v8a; do
  case "$abi" in
    armeabi-v7a) arch=arm; cpu=armv7-a; target=armv7a-linux-androideabi23 ;;
    arm64-v8a) arch=aarch64; cpu=armv8-a; target=aarch64-linux-android23 ;;
  esac
  mkdir -p "$build_dir/$abi" "$module_dir/build/jniLibs/$abi"
  cd "$build_dir/$abi"
  "$source_dir/configure" --prefix="$build_dir/$abi/installed" --target-os=android --enable-cross-compile \
    --arch="$arch" --cpu="$cpu" --cc="$toolchain/$target-clang" \
    --cxx="$toolchain/$target-clang++" --ar="$toolchain/llvm-ar" \
    --nm="$toolchain/llvm-nm" --ranlib="$toolchain/llvm-ranlib" \
    --strip="$toolchain/llvm-strip" --enable-pic --enable-static --disable-shared \
    --disable-doc --disable-programs --disable-everything --disable-avdevice \
    --disable-avformat --disable-swscale --disable-postproc --disable-avfilter \
    --disable-symver --disable-v4l2-m2m --disable-vulkan --enable-swresample \
    "${decoder_options[@]}"
  make -j8
  make install-headers
  "$toolchain/$target-clang++" -std=c++11 -shared -fPIC -static-libstdc++ \
    -Wl,-z,max-page-size=16384 -Wl,-Bsymbolic -Wl,--no-undefined \
    -I"$build_dir/$abi/installed/include" "$module_dir/src/main/jni/ffmpeg_jni.cc" \
    -Wl,--start-group libswresample/libswresample.a libavcodec/libavcodec.a libavutil/libavutil.a \
    -Wl,--end-group -landroid -llog -lz -lm -o "$module_dir/build/jniLibs/$abi/libffmpegJNI.so"
  "$toolchain/llvm-strip" --strip-unneeded "$module_dir/build/jniLibs/$abi/libffmpegJNI.so"
done
