#!/usr/bin/env bash
# Record the narration with Gemini TTS, cue every frame to it, and render.
# Run from video/architrek-launch with GEMINI_API_KEY set.
#   SK=path/to/.agents/skills  bash ../tools/rebuild_with_voice.sh
set -euo pipefail
SK="${SK:-$(pwd)/.agents/skills}"
PLV="$SK/product-launch-video/scripts"
VOICE="${VOICE:-Fenrir}"
MODEL="${MODEL:-gemini-3.8-flash-tts}"
STYLE="${STYLE:-Energetic product-launch narrator with a real sense of urgency. Brisk pace, punchy and confident, crisp consonants, rising energy on the questions. Keep pauses short.}"

[ -n "${GEMINI_API_KEY:-}${GOOGLE_API_KEY:-}" ] || { echo "GEMINI_API_KEY is not set"; exit 1; }

# 1. new voice
rm -rf assets/voice
node "$PLV/audio.mjs" --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . \
  --out ./audio_meta.json --provider gemini --voice "$VOICE" --tts-model "$MODEL" --style "$STYLE"

# 2. 0.4 s of breathing room after each line, then real durations
for f in assets/voice/*.wav; do ffmpeg -v error -y -i "$f" -af "apad=pad_dur=0.4" "${f%.wav}.tmp.wav" && mv "${f%.wav}.tmp.wav" "$f"; done
python3 - <<'PY'
import json, subprocess
m = json.load(open("audio_meta.json"))
for v in m["voices"]:
    v["duration_s"] = round(float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",v["path"]],capture_output=True,text=True).stdout), 3)
json.dump(m, open("audio_meta.json", "w"), indent=2)
PY

# 3. word timings: keep Whisper's if it ran, else approximate them from the script
python3 - <<'PY' && python3 ../tools/align_words.py .
import json, sys
m = json.load(open("audio_meta.json"))
sys.exit(0 if any(not v.get("words") for v in m["voices"]) else 1)
PY
true

# 4. frame durations, captions, assembly, then cue times (after assembly, which pads each frame's root)
node "$PLV/audio.mjs" sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md
node "$PLV/captions.mjs" build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json
node "$PLV/assemble-index.mjs" --storyboard ./STORYBOARD.md --hyperframes .
node "$PLV/transitions.mjs" inject --storyboard ./STORYBOARD.md --hyperframes .
python3 ../tools/cues_from_words.py audio_meta.json compositions/frames ../tools/cue_map.json
node "$PLV/transitions.mjs" verify --storyboard ./STORYBOARD.md --index ./index.html
sed -i 's#https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js#assets/vendor/gsap.min.js#g' index.html compositions/*.html

# 5. check and render
npx --yes hyperframes@0.8.183 check
npx --yes hyperframes@0.8.183 render --quality high --output renders/video.mp4
