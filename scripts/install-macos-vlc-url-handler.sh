#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Applications/TorrServer VLC URL Handler.app"
PLIST="$APP_DIR/Contents/Info.plist"
SCRIPT="$ROOT_DIR/scripts/macos-vlc-url-handler.applescript"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

mkdir -p "$HOME/Applications"
rm -rf "$APP_DIR"
osacompile -o "$APP_DIR" "$SCRIPT"

/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string local.torrserver.vlc-url-handler" "$PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier local.torrserver.vlc-url-handler" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleName string TorrServer VLC URL Handler" "$PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Set :CFBundleName TorrServer VLC URL Handler" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string TorrServer VLC URL Handler" "$PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName TorrServer VLC URL Handler" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes:0" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string VLC URL" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string vlc" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :LSBackgroundOnly bool true" "$PLIST" 2>/dev/null ||
  /usr/libexec/PlistBuddy -c "Set :LSBackgroundOnly true" "$PLIST"

"$LSREGISTER" -f "$APP_DIR"
echo "$APP_DIR"
