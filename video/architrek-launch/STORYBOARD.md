---
format: 1920x1080
duration: 55s
message: "ArchiTrek shows students how two ArchiMate elements connect, and why"
arc: Hook → Problem → Product intro → Demo (pick, routes, decide, explain, rigor, export) → CTA
audience: university students learning ArchiMate 3.2, and their teachers
mode: autonomous
music: none
---

## Video direction

- palette system: from frame.md. Canvas #f7f7f7 is the ground of every demo frame. Navy ink #1a2432 is the ground of the title (Frame 3) and end card (Frame 10) and the colour of all text. Element boxes use the ArchiMate layer fills (technology #c1ffb1, application #bfffff, business #fffbe6) with a 2px navy stroke, exactly as the app draws them. Orange #ff4500 is the only accent: the 12px kicker square and the highlight box. At most one orange thing on screen.
- screens: every demo frame (4–9) shows a real screenshot from assets/ as a window on the canvas (white, 1px #e5e7eb border, square corners, one soft shadow). The screenshots are 3840×2160 images of a 1920×1080 viewport; region coordinates below are in that 1920×1080 viewport space. Push-ins up to about 2.4× stay sharp.
- type: IBM Plex Sans for everything. A kicker (orange square + uppercase letter-spaced label, text-muted) sits top-left on demo frames, naming the step: "1 · PICK", "2 · SEARCH", "3 · DECIDE", "4 · UNDERSTAND", "5 · SET THE RIGOR", "6 · TAKE IT WITH YOU".
- motion grammar: power3 eases, smooth over bouncy. Camera = a slow push-in on the screenshot toward the region the VO names, then hold. Reveal each overlay (highlight box, label) on its spoken cue. Nothing appears before the VO reaches it.
- rhythm: Frames 1–2 are typographic and calm. Frame 3 is a short brand beat. Frames 4–9 are the demo, each one push-in and a held read. Frame 7 is the deliberate breather (slowest push, longest hold). Frame 10 holds still on the end card.
- negative list: no gradients, glows, neon, glass, bokeh, purple-blue AI gradients, rounded pills, bouncy springs, floating decorative shapes, fake browser chrome, real cursors. No slideshow (front-load then freeze) and no screensaver (everything drifting independently).
- captions: on, bottom band (navy card, square corners). Keep content in the top ~83%.

## Frame 1 — Two boxes

- scene: Two ArchiMate element boxes, Node and Business Function, far apart on the light canvas; a dashed grey line with a question mark grows between them
- voiceover: "Every ArchiMate student hits this question. How do these two boxes connect?"
- duration: 4.651s
- transition_in: cut
- status: animated
- src: compositions/frames/01-two-boxes.html
- type: hook
- persuasion: Pain validation
- beat: curiosity
- blueprint: compose
- focal: the two element boxes (built in HTML, styled like the app's diagram)
- asset_candidates:

Scene 1 (0.0–2.0s): empty #f7f7f7 canvas; kicker "ARCHIMATE 3.2" fades in top-left. On "ArchiMate student", a green Node box (technology fill, 2px navy stroke, small node icon top-right, square-ish corners) rises into the left third, upper-middle height. Centered row composition, boxes about 22% of width each.
Scene 2 (2.0–3.6s): on "How do these two boxes", a cream Business Function box (business fill, rounded behaviour corners) rises into the right third, same row.
Scene 3 (3.6–5.0s): on "connect", a dashed grey hop line draws left to right between them and a navy hop badge with "?" pops at its midpoint. Hold.

narrativeRole: open on the exact question students ask.
keyMessage: connecting two element types is the hard part.

## Frame 2 — The table

- scene: One cell of the Appendix B relationship table, Node row by Business Function column, holding six letters f i O r t v; only O is capital
- voiceover: "The relationship table tells you what is allowed. It does not tell you through what."
- duration: 4.459s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-the-table.html
- type: problem
- persuasion: Negative contrast
- beat: frustration
- blueprint: kinetic-type-beats (Adapt)
- focal: the table cell
- asset_candidates:

Adapt: keep the in-place token change; the tokens are the cell's letters, not words.
Scene 1 (0.0–2.6s): a white table fragment (square grid, 1px #e5e7eb lines) builds centre-left: row header "Node", column header "Business Function", and the cell. On "what is allowed", the six letters type into the cell one by one: f i O r t v, large and navy, O in bold. A small legend under the cell names them: flow · assignment · association · realization · triggering · serving.
Scene 2 (2.6–6.0s): on "through what", the five lowercase letters dim to grey and a line of text sets in on the right half: "Allowed. But through what?" with "through what?" underlined in orange. Hold.

narrativeRole: name the gap the tool fills.
keyMessage: the table lists what is allowed, not the chain behind it.

## Frame 3 — ArchiTrek

- scene: Navy ground, the white ArchiTrek logo assembles centre, tagline under it
- voiceover: "ArchiTrek finds the route."
- duration: 1.685s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-architrek.html
- type: product_intro
- persuasion: Friction reduction
- beat: relief
- blueprint: logo-assemble-lockup (Adapt)
- focal: assets/logo.svg
- asset_candidates: assets/logo.svg — ArchiTrek logo, white, for navy grounds

Adapt: the mark draws on (cliff outline strokes in, the dashed descent line draws down), then the wordmark sets.
Scene 1 (0.0–1.4s): navy #1a2432 full frame. The logo (assets/logo.svg, about 46% of frame width, centred slightly above middle) reveals: mark first, then "ArchiTrek" wordmark, on "ArchiTrek".
Scene 2 (1.4–3.0s): on "finds the route", the tagline "ARCHIMATE STUDY ENGINE" is already part of the logo; add one line below in white at 70% opacity: "Find the route. Read the rule." Hold still.

narrativeRole: introduce the product as the answer.
keyMessage: ArchiTrek finds the route.

## Frame 4 — Pick

- scene: The real waypoint editor, Node → Application Component → Business Function, push-in to the cards then to Find Path
- voiceover: "Pick a start and an end. Add a stop in between if you want one. Then click Find Path."
- duration: 5.077s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/04-pick.html
- type: key_feature
- persuasion: Show-don't-tell proof
- beat: ease
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s02-edit.png
- asset_candidates: assets/s02-edit.png — waypoint editor with Node, Application Component, Business Function cards and the Find Path button

Adapt: one floating window, camera moves between two regions; no device mockup.
Regions (viewport px): waypoint cards row x 14–806, y 99–207 (A at x 14–254, B at x 290–530, C at x 566–806). Find Path button x 1801–1916, y 174–218.
Scene 1 (0.0–2.4s): kicker "1 · PICK". The screenshot window enters at full width, then pushes in (about 2.2×) to the waypoint cards row. On "a start and an end", an orange highlight box outlines card A, then moves to card C.
Scene 2 (2.4–4.2s): on "a stop in between", the highlight box moves to card B.
Scene 3 (4.2–6.0s): on "click Find Path", the camera travels right to the Find Path button (about 2.4×) and the highlight box lands on it with a single short press (scale 0.96 and back). Hold.

narrativeRole: show how simple the input is.
keyMessage: two elements and one click.

## Frame 5 — Routes

- scene: The result screen: diagram on top, route list bottom left; push to the route list
- voiceover: "ArchiTrek searches the Appendix B tables and ranks every legal route. Direct relationships come first."
- duration: 6.848s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-routes.html
- type: key_feature
- persuasion: Show-don't-tell proof
- beat: clarity
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s03-route-undecided.png
- asset_candidates: assets/s03-route-undecided.png — result screen with the four-element route diagram, the list of five routes and the Route 1 explanation

Regions (viewport px): diagram row x 540–1360, y 120–230. Route list rows x 30–700, y 665–830 (Route 1 at y 670–695, Route 5 at y 800–825). Badges Technology-Heavy and Ground-Truth around x 430–690.
Scene 1 (0.0–3.0s): kicker "2 · SEARCH". Full screenshot in the window; slow push (about 1.8×) to the diagram row as the VO says "searches the Appendix B tables".
Scene 2 (3.0–5.2s): on "ranks every legal route", the camera tilts down to the route list (about 2×); the five route rows get a staggered orange tick on the left edge, top to bottom.
Scene 3 (5.2–7.0s): on "Direct relationships come first", the highlight box settles on Route 1 and a small label appears beside it: "cost 1 per direct hop · 5 per derived hop". Hold.

narrativeRole: the engine at work.
keyMessage: every legal route, ranked by evidence.

## Frame 6 — Decide each hop

- scene: Right-click menu on a hop with the relationship types, then the decided route with proper ArchiMate arrows
- voiceover: "You decide each hop. Right-click an arrow to choose its relationship."
- duration: 3.797s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-decide.html
- type: key_feature
- persuasion: Control
- beat: control
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s04-ctx-menu.png
- asset_candidates: assets/s04-ctx-menu.png — right-click menu open on hop 1 with Relationship type submenu; assets/s05-route.png — the same route with all hops decided (realization, assignment, serving)

Regions (viewport px): diagram x 540–1360, y 120–230. Context menu x 741–871, y 167–259; submenu x 871–1035, y 171–309.
Scene 1 (0.0–3.2s): kicker "3 · DECIDE". Window pushed in about 2.2× on the diagram and menu (s04-ctx-menu.png). On "Right-click an arrow", the highlight box outlines the submenu list.
Scene 2 (3.2–6.0s): on "choose its relationship", a clean crossfade inside the window to s05-route.png at the same framing: the dashed grey hops become real ArchiMate arrows. Hold.

narrativeRole: the student stays in charge.
keyMessage: the tool does not guess what you mean.

## Frame 7 — Read why

- scene: The step-by-step justification panel, Phase 1 and Phase 2 with their hops
- voiceover: "Then read why. Every hop comes with its rule and its section in the specification."
- duration: 4.885s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-read-why.html
- type: key_feature
- persuasion: Authority by association
- beat: trust
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s06-explain.png
- asset_candidates: assets/s06-explain.png — explanation panel scrolled to Step-by-step justification, Phase 1 technology to application, Phase 2 application to business

Regions (viewport px): justification panel x 730–1880, y 520–1060. Phase 1 block x 745–1860, y 565–800.
Scene 1 (0.0–2.0s): kicker "4 · UNDERSTAND". Window starts framed on the right half of the screen and pushes slowly (about 1.7×) toward the justification panel on "read why".
Scene 2 (2.0–6.0s): on "its rule and its section", the highlight box outlines the Phase 1 hop block. This is the breather: slowest push, long hold.

narrativeRole: the learning payoff.
keyMessage: every hop is explained.

## Frame 8 — Rigor

- scene: The Options panel with Explicit vs Inferred and Semantic rigor set to Academic
- voiceover: "Keep the search strict for your assignments, or loosen it to explore."
- duration: 3.563s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/08-rigor.html
- type: key_feature
- persuasion: Feature-to-benefit translation
- beat: confidence
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s07-options.png
- asset_candidates: assets/s07-options.png — Options panel open: Viewpoint, Domain context, Explicit vs Inferred, Semantic rigor Academic (Strict)

Regions (viewport px): options panel x 1428–1908, y 92–539. Semantic rigor label and select x 1441–1900, y 370–440.
Scene 1 (0.0–2.4s): kicker "5 · SET THE RIGOR". Push in (about 2×) to the options panel. On "strict", the highlight box outlines the Semantic rigor select reading Academic (Strict).
Scene 2 (2.4–5.0s): on "loosen it to explore", three small chips set in beside the panel, left of it, stacked: "Academic", "Pragmatic", "Discovery", with Academic filled navy and the other two outlined. Hold.

narrativeRole: fit the tool to the task.
keyMessage: strict for exams, looser to explore.

## Frame 9 — Take it with you

- scene: The download popover with PNG, SVG, PDF, CSV, XML and Copy share link
- voiceover: "Take the route with you, as a picture, a share link, or a model that opens in Archi."
- duration: 5.12s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/09-take-it.html
- type: key_feature
- persuasion: Value stacking
- beat: satisfaction
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s08-download.png
- asset_candidates: assets/s08-download.png — download popover: PNG, SVG, PDF, CSV, XML, Copy share link

Regions (viewport px): popover x 1598–1868, y 103–240. PNG chip near x 1610–1650, y 137–165. XML chip x 1812–1857, y 137–165. Copy share link x 1610–1857, y 203–231.
Scene 1 (0.0–2.0s): kicker "6 · TAKE IT WITH YOU". Push in (about 2.4×) to the popover. On "a picture", highlight the PNG chip.
Scene 2 (2.0–3.6s): on "a share link", the highlight moves to Copy share link.
Scene 3 (3.6–6.0s): on "opens in Archi", the highlight moves to XML and a label sets in below the popover: "Open Exchange XML → Archi". Hold.

narrativeRole: the work leaves the tool.
keyMessage: export to a picture, a link or Archi.

## Frame 10 — End card

- scene: Navy end card with the ArchiTrek logo and the address
- voiceover: "ArchiTrek. Free, and it runs in your browser."
- duration: 2.965s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/10-end-card.html
- type: cta
- persuasion: Friction reduction
- beat: motivation
- blueprint: logo-assemble-lockup (Adapt)
- focal: assets/logo.svg
- asset_candidates: assets/logo.svg — ArchiTrek logo, white

Adapt: the lockup arrives already assembled and settles; the URL is the extension.
Scene 1 (0.0–1.5s): navy full frame. Logo centred (about 40% width) fades and settles from a slight scale-down on "ArchiTrek".
Scene 2 (1.5–4.0s): on "Free", the address "architrek.hronmichal.net" sets in under the logo in white, with a thin orange rule above it. A small line under that in 60% white: "Unofficial study tool · ArchiMate is a registered trademark of The Open Group". Hold still to the end.

narrativeRole: tell them where to go.
keyMessage: free, in the browser, at architrek.hronmichal.net.
