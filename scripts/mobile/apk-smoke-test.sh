#!/usr/bin/env bash
# Boot an APK on a running emulator and fail if it crashes on startup.
#
# Four consecutive FlowForge releases (v3.0.2 - v3.0.5) shipped APKs that died
# before the first frame. Nothing in the build caught it because a Gradle build
# succeeding says nothing about whether the app can start. This gate does.
#
# Usage: apk-smoke-test.sh <path-to-apk> [package-name]

set -euo pipefail

APK="${1:?usage: apk-smoke-test.sh <path-to-apk> [package-name]}"
PKG="${2:-com.flowforge.app}"
SETTLE_SECONDS="${SETTLE_SECONDS:-25}"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

echo "==> Waiting for emulator"
adb wait-for-device
# Device can report as online well before the package manager accepts installs.
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
  sleep 2
done

echo "==> Installing $APK"
adb install -r -d "$APK"

echo "==> Clearing logcat"
adb logcat -c || true

echo "==> Launching $PKG"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1

echo "==> Letting the app settle for ${SETTLE_SECONDS}s"
sleep "$SETTLE_SECONDS"

LOG="$(mktemp)"
adb logcat -d > "$LOG" 2>/dev/null || true

FAILED=0

PID="$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$PID" ]]; then
  echo "FAIL: $PKG is not running ${SETTLE_SECONDS}s after launch." >&2
  FAILED=1
else
  echo "OK: $PKG alive (pid $PID)"
fi

if grep -qE "FATAL EXCEPTION|E AndroidRuntime" "$LOG"; then
  echo "FAIL: fatal exception in logcat." >&2
  FAILED=1
fi

if grep -qE "Process $PKG .*has died|ANR in $PKG" "$LOG"; then
  echo "FAIL: process died or hit an ANR." >&2
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "" >&2
  echo "===== relevant logcat =====" >&2
  grep -E "AndroidRuntime|FATAL|$PKG|ReactNative|ANR in" "$LOG" | tail -n 120 >&2
  echo "===========================" >&2
  exit 1
fi

echo "==> Smoke test passed: $PKG started and stayed alive."
