#!/usr/bin/env python3
"""Set every frame's cue times from the word timings of the current voice.

cue_map.json names, per frame file, which spoken word each CUES key waits for:
"word" is the first occurrence in that frame's line, "word#2" the second.
Words are compared lowercase with punctuation removed ("Right-click" -> "rightclick").
The duration constant (END / DUR / DURATION, or an END / end key in CUES) becomes
the voice line's length, and every data-duration in the frame becomes the frame's
root duration (sync-durations sets that one first), so inner clips span the frame.

usage: cues_from_words.py audio_meta.json FRAMES_DIR cue_map.json
"""
import json, re, sys
from pathlib import Path

meta = {v["frame"]: v for v in json.load(open(sys.argv[1]))["voices"]}
frames = Path(sys.argv[2])
cue_map = json.load(open(sys.argv[3]))
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
errors = []

for path in sorted(frames.glob("*.html")):
    s = path.read_text()
    m = re.search(r'data-duration="([\d.]+)"', s)
    if m:
        s = re.sub(r'data-duration="[\d.]+"', f'data-duration="{m.group(1)}"', s)
    num = int(path.name[:2])
    if num not in meta:
        path.write_text(s)
        continue
    v = meta[num]
    words = [norm(w["text"]) for w in v["words"]]
    dur = v["duration_s"]
    m = re.search(r"const CUES = \{(.*?)\};", s, re.S)
    body = m.group(1)
    for key, target in cue_map.get(path.stem, {}).items():
        word, _, nth = target.partition("#")
        hits = [i for i, w in enumerate(words) if w == norm(word)]
        if len(hits) < int(nth or 1):
            errors.append(f"{path.name}: {key} -> {target!r} not in line ({' '.join(words)})")
            continue
        t = v["words"][hits[int(nth or 1) - 1]]["start"]
        body, n = re.subn(r"(\b%s\s*:\s*)[-\d.]+" % re.escape(key), r"\g<1>%.3f" % t, body)
        if n != 1:
            errors.append(f"{path.name}: CUES key {key!r} matched {n} times")
    body = re.sub(r"(\b(?:END|end)\s*:\s*)[\d.]+", r"\g<1>%s" % dur, body)
    s = s[:m.start(1)] + body + s[m.end(1):]
    s = re.sub(r"(const (?:END|DUR|DURATION)\s*=\s*)\d+(?:\.\d+)?", r"\g<1>%s" % dur, s)
    path.write_text(s)
    print(f"cued {path.name} to {dur}s")

if errors:
    sys.exit("\n".join(errors))
