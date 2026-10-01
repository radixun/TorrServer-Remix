#!/usr/bin/env bash
# Fork build entry point; builds do not install or publish anything.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
cd "$root"
export NODE_OPTIONS="${NODE_OPTIONS:-} --openssl-legacy-provider"
export REACT_APP_SERVER_HOST="${REACT_APP_SERVER_HOST:-}"
export GENERATE_SOURCEMAP=false
(cd web && yarn install --frozen-lockfile && yarn build)
go run gen_web.go
mkdir -p dist
platforms="${PLATFORMS:-linux/amd64}"
version="${FORK_VERSION:-MatriX.145.1-mod}"
for platform in $platforms; do
  target_os="${platform%/*}"
  target_arch="${platform#*/}"
  case "$platform" in */*/*|*/*[!a-zA-Z0-9]*|*[!a-zA-Z0-9/]*) echo "Invalid platform: $platform" >&2; exit 1;; esac
  [ "$target_os" != "$target_arch" ] || { echo "Expected OS/ARCH" >&2; exit 1; }
  suffix=""
  [ "$target_os" != windows ] || suffix=.exe
  (cd server && CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -tags=nosqlite -trimpath \
    -ldflags="-s -w -checklinkname=0 -X server/version.Version=$version" \
    -o "$root/dist/TorrServer-$target_os-$target_arch$suffix" ./cmd)
done
