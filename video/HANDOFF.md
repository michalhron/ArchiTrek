# Handoff

State: first draft built and rendered (43 s, Kokoro stand-in voice). The user approved a new, case-based script (below). Rebuild in progress.

## Approved new script (case-based, self-contained)

1. The case: an insurance company runs its bookkeeping on an old mainframe; the architects must show how that machine supports the finance department's work.
2. The gap: the mainframe is a Node, the finance work a Business Function. The table says they can connect, not through what.
3. ArchiTrek finds the route.
4. Pick Node and Business Function, click Find Path.
5. Every route is legal; not every route tells the story of this case.
6. Pin the layer you mean: add Application Component; the route runs through the software.
7. Right-click each hop to choose its relationship; every hop comes with its rule and section.
8. Export to Archi and keep modelling.
9. Close on the open question: the company wants to replace the mainframe with a cloud server. Which elements change? Which arrows? Model it with ArchiTrek. Do not give the answer.

## Voice

Gemini TTS (voice Kore, model gemini-3.8-flash-tts) through the skill's audio engine with `--provider gemini`. Needs `GEMINI_API_KEY` in the environment. Send "ArchiTrek" to TTS as "Archie Trek" so it is pronounced right; captions keep "ArchiTrek".

## Environment notes

- huggingface.co is blocked here, so Whisper word timing fails. `tools/align_words.py` writes approximate timings from silence detection.
- cdn.jsdelivr.net is blocked, so GSAP is vendored at `assets/vendor/gsap.min.js`.
- Each frame keeps its cue times in one `const CUES = {...}` object; retime by editing it.
