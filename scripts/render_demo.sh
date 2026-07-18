#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/counterexample-studio-demo.mp4}"
AUDIO="${TMPDIR:-/tmp}/counterexample-studio-narration.aiff"

command -v say >/dev/null
command -v ffmpeg >/dev/null

say -v Samantha -r 190 -f "$ROOT/docs/VIDEO_NARRATION.txt" -o "$AUDIO"

ffmpeg -y \
  -f concat \
  -safe 0 \
  -i "$ROOT/docs/DEMO_SEQUENCE.ffconcat" \
  -i "$AUDIO" \
  -vf "setpts=PTS*5/6,scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0x111827,format=yuv420p" \
  -r 25 \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -c:a aac \
  -b:a 192k \
  -shortest \
  "$OUTPUT"

printf 'Rendered %s\n' "$OUTPUT"
