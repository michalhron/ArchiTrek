#!/usr/bin/env python3
"""Retime every frame after a new voice recording.

Each frame keeps its cue times in one `const CUES = {...}` object, plus a
duration constant (END / DUR / DURATION, or CUES.end). This maps every
numeric value from the old voice's timeline onto the new one with a
piecewise-linear warp anchored on the word start times of the same line
(word i of the old line -> word i of the new line, 0 -> 0, old end -> new end).

usage: retime_from_voice.py OLD_audio_meta.json NEW_audio_meta.json FRAMES_DIR
"""
import json, re, sys
from bisect import bisect_right
from pathlib import Path

old = {v["frame"]: v for v in json.load(open(sys.argv[1]))["voices"]}
new = {v["frame"]: v for v in json.load(open(sys.argv[2]))["voices"]}
frames = Path(sys.argv[3])

def warp_fn(o, n):
    ow, nw = o["words"], n["words"]
    k = min(len(ow), len(nw))
    xs = [0.0] + [w["start"] for w in ow[:k]] + [o["duration_s"]]
    ys = [0.0] + [w["start"] for w in nw[:k]] + [n["duration_s"]]
    pts = sorted(set(zip(xs, ys)))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    def f(t):
        if t <= xs[0]:
            return ys[0]
        if t >= xs[-1]:
            return ys[-1] + (t - xs[-1])
        i = bisect_right(xs, t) - 1
        x0, x1, y0, y1 = xs[i], xs[i + 1], ys[i], ys[i + 1]
        return y0 + (t - x0) * (y1 - y0) / (x1 - x0) if x1 > x0 else y0
    return f

for path in sorted(frames.glob("*.html")):
    num = int(path.name[:2])
    if num not in old or num not in new:
        print(f"skip {path.name} (no voice line)")
        continue
    f = warp_fn(old[num], new[num])
    dur = new[num]["duration_s"]
    s = path.read_text()
    m = re.search(r"const CUES = \{(.*?)\};", s, re.S)
    body = re.sub(r"(:\s*)(\d+(?:\.\d+)?)", lambda g: g.group(1) + f"{f(float(g.group(2))):.3f}", m.group(1))
    s = s[:m.start(1)] + body + s[m.end(1):]
    s = re.sub(r"(const (?:END|DUR|DURATION)\s*=\s*)\d+(?:\.\d+)?", lambda g: g.group(1) + f"{dur}", s)
    s = re.sub(r"(\bEND\s*:\s*)\d+(?:\.\d+)?", lambda g: g.group(1) + f"{dur}", s)
    s = re.sub(r"(\bend\s*:\s*)\d+(?:\.\d+)?", lambda g: g.group(1) + f"{dur}", s)
    path.write_text(s)
    print(f"retimed {path.name}: {old[num]['duration_s']}s -> {dur}s")
