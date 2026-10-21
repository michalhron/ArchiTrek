---
workflow: product-launch-video
flow: automation
storyboard: no
message: "ArchiTrek shows students how two ArchiMate elements connect, and why"
destination: website-splash
aspect: 1920x1080
language: en
audience: university students learning ArchiMate 3.2, and their teachers
length: 55s
angle: problem-solution site tour
voice: gemini Kore
---

## Intent

A short narrated demo of ArchiTrek for the app's own website, used as a splash or intro video. It shows what the software does: pick two element types, find the legal routes through the ArchiMate 3.2 Appendix B tables, decide each hop, read the explanation, and export. Calm, clear, credible. Made for students, so plain words and no hype.

## Assets

- capture/assets/*.png — screenshots of the running app, taken locally from the repository at 1920x1080. These are the featured visuals.
- capture/assets/logo.svg — the ArchiTrek logo, white on transparent.
- capture/assets/logo-on-light.svg — the logo in navy for light backgrounds.

## Customizations

- Feature the app's own screens. Do not rebuild the UI in HTML except for small overlays (cursor, highlight boxes, labels).
- Look and feel follows the app: navy #1a2432 header colour, light #f7f7f7 canvas, white cards, square corners, IBM Plex Sans, ArchiMate layer colours (technology #c1ffb1, application #bfffff, business #fffbe6), orange #ff4500 used sparingly as an accent.
- Voiceover with Google Gemini TTS (the user's credits). Captions on, so it also works muted.
- No background music unless it stays very quiet.

## Notes

- The live site is not reachable from this container, so screens come from a local server running the same code.
- Writing style for narration: short active sentences, plain words, no "X, not Y" constructions.
- End card: ArchiTrek logo and architrek.hronmichal.net.
