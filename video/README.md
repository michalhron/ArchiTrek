# ArchiTrek demo video

Source for the narrated demo video of ArchiTrek, built with [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML compositions rendered to MP4). Not deployed: `scripts/deploy-ftp.sh` skips `video/`.

- `architrek-launch/` — the HyperFrames project: `BRIEF.md` (intent), `STORYBOARD.md` (frames), `SCRIPT.md` (narration), `frame.md` (design system taken from the app), `compositions/frames/*.html` (one file per frame), `assets/` (app screenshots, fonts, GSAP, voice).
- `tools/align_words.py` — approximate word timings for the captions when no Whisper model can be downloaded.

## Rebuild

```bash
cd video/architrek-launch
npx skills add heygen-com/hyperframes --yes      # the HyperFrames agent skills
npx hyperframes browser ensure                   # headless Chrome for rendering
npx hyperframes check
npx hyperframes render --quality high --output renders/video.mp4
```

See `HANDOFF.md` for the current state and the next steps.
