# Handoff

## State

The case-based version is built, checked and rendered with a stand-in voice (Kokoro, offline): 59 s, 1920×1080, 11 frames, captions on. What remains is the final voice (Gemini TTS) and a re-render, then a web version for the site.

Frames (`architrek-launch/compositions/frames/`):

| # | File | What it shows |
|---|---|---|
| 1 | 01-case.html | The case in three layer bands: Mainframe at the bottom, the finance work at the top, a "?" between |
| 2 | 02-the-table.html | The Appendix B cell Node → Business Function: f i O r t v, "Allowed. But through what?" |
| 3 | 03-architrek.html | Logo on navy |
| 4 | 04-pick.html | Waypoint editor, Node and Business Function, Find Path |
| 5 | 05-routes.html | Five routes, "0 routes through the Application layer" |
| 6 | 06-steer.html | Add Application Component, swimlane view through the Application band |
| 7 | 07-decide.html | Right-click menu, the hops become real ArchiMate arrows |
| 8 | 08-read-why.html | Step-by-step justification |
| 9 | 09-export.html | Download popover, XML → Archi |
| 10 | 10-your-turn.html | The case again with SAP ERP filled in; Mainframe → Cloud server; "?" on the arrows; ends on the question |
| 11 | 11-end-card.html | Silent end card with the address |

## Next: the Gemini voice

Needs `GEMINI_API_KEY` in the environment (set in the cloud environment settings; a new session picks it up).

```bash
cd video/architrek-launch
npx skills add heygen-com/hyperframes --yes      # installs the skills into .agents/skills
npx hyperframes browser ensure                   # headless Chrome for rendering
SK=$PWD/.agents/skills bash ../tools/rebuild_with_voice.sh
```

`rebuild_with_voice.sh` records the narration in `SCRIPT.md` with Gemini (voice Kore, model gemini-3.8-flash-tts; override with `VOICE=`, `MODEL=`, `STYLE=`), pads each line by 0.4 s, gets word timings, syncs frame durations, retimes every frame (`tools/retime_from_voice.py` maps the stand-in voice's word times in `audio_meta.kokoro.json` onto the new ones), rebuilds captions, assembles, checks and renders `renders/video.mp4`.

After the render, look at a contact sheet (`npx hyperframes snapshot --at <times>`) before handing it over.

## Pronunciation

`SCRIPT.md` spells the product "Archie Trek" in the spoken lines so TTS says it right. `tools/align_words.py` merges the two words back to "ArchiTrek" in the captions. If Whisper word timing is available instead, check that the captions still read "ArchiTrek".

## Environment notes

- huggingface.co is blocked in the current environment, so Whisper word timing fails; `tools/align_words.py` writes approximate timings (silence detection + syllable weighting). Allowing huggingface.co gives exact caption timing.
- cdn.jsdelivr.net is blocked, so GSAP is vendored at `assets/vendor/gsap.min.js`; the rebuild script rewrites CDN links the HyperFrames scripts emit.
- Each frame keeps its cue times in one `const CUES = {...}` object; `tools/set_cues.py` edits one frame by hand.

## After the final render

- Make a web version (for example `ffmpeg -i renders/video.mp4 -c:v libx264 -crf 26 -preset slow -movflags +faststart -c:a aac -b:a 96k architrek-demo.mp4`) and a poster frame.
- Decide with the user where it goes on the site: the welcome window or a splash page.
