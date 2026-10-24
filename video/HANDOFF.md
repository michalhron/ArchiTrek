# Handoff

## State

The launch version is built, checked and rendered: 79.5 s, 1920×1080, 13 frames, captions on, voice Fenrir (Gemini TTS, gemini-3.8-flash-tts) with a high-energy direction. The web version and its poster (the end card) are published in the app at `assets/media/architrek-demo.mp4` and `assets/media/architrek-demo-poster.jpg`, where the welcome window plays them next to the examples.

Frames (`architrek-launch/compositions/frames/`):

| # | File | What it shows |
|---|---|---|
| 1 | 01-case.html | The case in three layer bands: Mainframe at the bottom, the finance work at the top, SAP ERP between them with a "?" on each side |
| 2 | 02-the-table.html | The Appendix B cell Node → Business Function: f i O r t v, "Allowed. But through what?" |
| 3 | 03-architrek.html | Logo on navy |
| 4 | 04-pick.html | Waypoint editor, Node and Business Function, Find Path |
| 5 | 05-routes.html | Five routes, "0 routes through SAP" |
| 6 | 06-steer.html | SAP pinned as the Application Component waypoint (tagged "SAP ERP"), swimlane view through the Application band |
| 7 | 07-decide.html | Right-click menu, the hops become real ArchiMate arrows |
| 8 | 08-read-why.html | Step-by-step justification |
| 9 | 09-export.html | Download popover, XML → Archi |
| 10 | 10-rigor.html | Semantic rigor: the Options control, then Business Object → Artifact under Academic (no route), Pragmatic (5 routes), Discovery (5 other routes) |
| 11 | 11-more.html | Montage: a wall of eight screenshots; the camera dives into one per spoken feature, then pulls back out |
| 12 | 12-your-turn.html | The case with SAP ERP filled in; Mainframe → Cloud server; "?" on the arrows; ends on the question |
| 13 | 13-end-card.html | Silent end card with the address |

The screenshots for frames 10 and 11 (`assets/r*.png`, `assets/m*.png`) were captured from the app at 1920×1080, device scale 2.

## Re-recording the voice

Needs `GEMINI_API_KEY` in the environment (set in the cloud environment settings; a new session picks it up).

```bash
cd video/architrek-launch
npx skills add heygen-com/hyperframes --yes      # installs the skills into .agents/skills
npx hyperframes browser ensure                   # headless Chrome for rendering
SK=$PWD/.agents/skills bash ../tools/rebuild_with_voice.sh
```

`rebuild_with_voice.sh` records the narration in `SCRIPT.md` with Gemini (voice Fenrir, model gemini-3.8-flash-tts; override with `VOICE=`, `MODEL=`, `STYLE=`), pads each line by 0.4 s, gets word timings, syncs frame durations, rebuilds captions, assembles, sets every frame's cue times from the new word timings (`tools/cues_from_words.py` with `tools/cue_map.json`), checks and renders `renders/video.mp4`.

`tools/cue_map.json` names, for each frame, the spoken word each cue waits for (`"word"` or `"word#2"` for the second occurrence). When you rewrite a line, update its entry; `cues_from_words.py` stops with an error if a word is missing from the line. It runs after assembly and also stretches each frame's inner clips (`data-duration`) to the frame's padded length. Without that, a longer voice leaves frames blank for their last seconds while the captions run on.

After the render, look at a contact sheet (`npx hyperframes snapshot --at <times>`) before handing it over.

## Pronunciation

The name is said ARK-ee-trek, like ArchiMate. `SCRIPT.md` spells it "Arky Trek" in the spoken lines (with "Archie Trek" the TTS said it two different ways), and SAP as "S.A.P." so it is read as letters. `tools/align_words.py` turns them back into "ArchiTrek" and "SAP" in the captions. If Whisper word timing is available instead, check that the captions still read "ArchiTrek" and "SAP".

## Environment notes

- huggingface.co is blocked in the current environment, so Whisper word timing fails; `tools/align_words.py` writes approximate timings (silence detection + syllable weighting). On fast lines it looks for shorter pauses and fits the segments to the phrases by syllable share. Allowing huggingface.co gives exact caption timing.
- If `npx hyperframes` fails with "Permission denied", use the pinned `npx --yes hyperframes@0.8.183` (the rebuild script does).
- cdn.jsdelivr.net is blocked, so GSAP is vendored at `assets/vendor/gsap.min.js`; the rebuild script rewrites CDN links the HyperFrames scripts emit.
- Each frame keeps its cue times in one `const CUES = {...}` object; `tools/set_cues.py` edits one frame by hand.

## After a new render

- Replace the web version the app plays:
  `ffmpeg -i renders/video.mp4 -c:v libx264 -crf 26 -preset slow -movflags +faststart -c:a aac -b:a 96k ../../assets/media/architrek-demo.mp4`
  and the poster: `ffmpeg -ss 79.0 -i renders/video.mp4 -frames:v 1 -q:v 3 ../../assets/media/architrek-demo-poster.jpg`.
- Then deploy the app with `scripts/deploy-ftp.sh`.
