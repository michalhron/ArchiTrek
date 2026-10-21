#!/usr/bin/env python3
"""Approximate word timings for TTS clips when no ASR model is available.

Detects speech segments with ffmpeg silencedetect, splits the known script text
into phrases at punctuation, maps phrases onto segments, and spreads words
inside each phrase by syllable count. Writes voices[].words in audio_meta.json.
"""
import json, re, subprocess, sys
from pathlib import Path

root = Path(sys.argv[1])
meta_path = root / "audio_meta.json"
meta = json.loads(meta_path.read_text())

script = (root / "SCRIPT.md").read_text()
lines = {}
for m in re.finditer(r"^## Line (\d+).*?\n((?:.*\n)*?)(?=^## |\Z)", script, re.M):
    spoken = " ".join(l.strip() for l in m.group(2).splitlines() if l.startswith("    "))
    lines[int(m.group(1))] = spoken

def syllables(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w:
        return 1
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(1, n)

def speech_segments(path, dur):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af",
                          "silencedetect=noise=-38dB:d=0.14", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    segs, cur = [], 0.0
    for s, e in zip(starts, ends + [dur] * (len(starts) - len(ends))):
        if s - cur > 0.08:
            segs.append([cur, s])
        cur = e
    if dur - cur > 0.08:
        segs.append([cur, dur])
    return segs

for v in meta["voices"]:
    text = lines[v["frame"]]
    dur = v["duration_s"]
    segs = speech_segments(root / v["path"], dur)
    phrases = [p.strip() for p in re.split(r"(?<=[.,?!:])\s+", text) if p.strip()]
    # a one-word phrase ("Next,") rarely has its own pause: join it to the next phrase
    i = 0
    while i < len(phrases) - 1:
        if len(phrases[i].split()) == 1:
            phrases[i] = phrases[i] + " " + phrases.pop(i + 1)
        else:
            i += 1
    # merge segments down to the phrase count (join the closest gaps), or merge phrases up
    while len(segs) > len(phrases):
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = gaps.index(min(gaps))
        segs[i] = [segs[i][0], segs[i + 1][1]]
        del segs[i + 1]
    while len(phrases) > len(segs):
        # join the two shortest neighbouring phrases
        lens = [len(phrases[i]) + len(phrases[i + 1]) for i in range(len(phrases) - 1)]
        i = lens.index(min(lens))
        phrases[i] = phrases[i] + " " + phrases[i + 1]
        del phrases[i + 1]
    words = []
    for (a, b), phrase in zip(segs, phrases):
        ws = phrase.split()
        weights = [syllables(w) + 0.35 for w in ws]
        total = sum(weights)
        t = a
        for w, wt in zip(ws, weights):
            d = (b - a) * wt / total
            words.append({"text": w, "start": round(t, 3), "end": round(t + d * 0.92, 3)})
            t += d
    # display names: the script spells the product phonetically for TTS
    merged = []
    for w in words:
        if merged and merged[-1]["text"].lower() == "archie" and w["text"].lower().startswith("trek"):
            merged[-1] = {"text": "ArchiTrek" + w["text"][4:], "start": merged[-1]["start"], "end": w["end"]}
        else:
            merged.append(w)
    words = merged
    v["words"] = words
    v["words_source"] = "approximate: silencedetect + syllable weighting"
    print(f"frame {v['frame']}: {len(segs)} segments, {len(words)} words")

meta_path.write_text(json.dumps(meta, indent=2))
