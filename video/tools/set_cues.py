#!/usr/bin/env python3
"""Retime one frame: set CUES values, the duration constant and every data-duration.

usage: set_cues.py FRAME.html DURATION key=value [key=value ...]
The duration constant is whichever of END / DUR / DURATION the frame declares
(a numeric literal), or CUES.end when the frame keeps it there.
"""
import re, sys
path, dur, *pairs = sys.argv[1:]
s = open(path).read()
m = re.search(r"const CUES = \{(.*?)\};", s, re.S)
body = m.group(1)
for kv in pairs:
    k, v = kv.split("=")
    body, n = re.subn(r"(\b%s\s*:\s*)[-\d.]+" % re.escape(k), r"\g<1>%s" % v, body)
    if n != 1:
        sys.exit(f"{path}: CUES key {k!r} matched {n} times")
s = s[:m.start(1)] + body + s[m.end(1):]
s = re.sub(r"(const (?:END|DUR|DURATION)\s*=\s*)[\d.]+", r"\g<1>%s" % dur, s)
s = re.sub(r'data-duration="[\d.]+"', 'data-duration="%s"' % dur, s)
open(path, "w").write(s)
print("retimed", path, "to", dur)
