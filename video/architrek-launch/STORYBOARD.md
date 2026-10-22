---
format: 1920x1080
duration: 90s
message: "ArchiTrek shows how a mainframe reaches the finance work through SAP, hop by hop, shows how much more it does, and leaves the migration question to you"
arc: Case → Gap → Product intro → Demo (pick, routes, steer, decide, explain, export) → Rigor → Feature montage → Open question → End card
audience: anyone new to ArchiMate, students first
mode: autonomous
music: none
---

## Video direction

- palette system: from frame.md. Canvas #f7f7f7 is the ground of every demo frame. Navy ink #1a2432 is the ground of the title (Frame 3) and end card (Frame 13) and the colour of all text. Element boxes use the ArchiMate layer fills (technology #c1ffb1, application #bfffff, business #fffbe6) with a 2px navy stroke, exactly as the app draws them. Orange #ff4500 is the only accent: the 12px kicker square and the highlight box. At most one orange thing on screen.
- screens: every demo frame (4–9) shows a real screenshot from assets/ as a window on the canvas (white, 1px #e5e7eb border, square corners, one soft shadow). The screenshots are 3840×2160 images of a 1920×1080 viewport; region coordinates below are in that 1920×1080 viewport space. Push-ins up to about 2.4× stay sharp.
- type: IBM Plex Sans for everything. A kicker (orange square + uppercase letter-spaced label, text-muted) sits top-left on demo frames, naming the step: "1 · PICK", "2 · SEARCH", "3 · STEER", "4 · DECIDE", "5 · UNDERSTAND", "6 · TAKE IT TO ARCHI". Frames 10 and 11 carry "7 · RIGOR" and "8 · AND MORE". Frames 1 and 12 carry the kicker "THE CASE" and "YOUR TURN".
- motion grammar: power3 eases, smooth over bouncy. Camera = a slow push-in on the screenshot toward the region the VO names, then hold. Reveal each overlay (highlight box, label) on its spoken cue. Nothing appears before the VO reaches it.
- rhythm: Frames 1–2 are typographic and calm. Frame 3 is a short brand beat. Frames 4–9 are the demo, each one push-in and a held read. Frame 8 is the deliberate breather (slowest push, longest hold). Frame 10 shows the three rigor levels as three quick beats. Frame 11 is the one deliberate fast montage: cuts on each spoken feature, accelerating. Frame 12 ends on an open question and holds; Frame 13 is a silent end card.
- negative list: no gradients, glows, neon, glass, bokeh, purple-blue AI gradients, rounded pills, bouncy springs, floating decorative shapes, fake browser chrome, real cursors. No slideshow (front-load then freeze) and no screensaver (everything drifting independently).
- captions: on, bottom band (navy card, square corners). Keep content in the top ~83%.

## Frame 1 — The case

- scene: Three layer bands like the app's swimlanes; the Mainframe sits in Technology at the bottom, the Finance Department and Financial Transaction Processing in Business at the top, SAP ERP in the Application band between them
- voiceover: "An insurance company runs its bookkeeping on an old mainframe. Its finance team works in SAP, and SAP stays. The architects have to show how that mainframe supports the finance work."
- duration: 10.68s
- transition_in: cut
- status: animated
- src: compositions/frames/01-case.html
- type: hook
- persuasion: Concrete scenario
- beat: curiosity
- blueprint: compose
- focal: the three layer bands with the case's elements (built in HTML, styled like the app's swimlane view)
- asset_candidates:

Layout: kicker "THE CASE" top-left. Three full-width horizontal bands stacked in the top 83% (y about 150–860), labelled at their left edge in the app's style (small bold label): "Business" (band fill #f5e87a at about 35% strength, as the app's swimlane shows it), "Application" (#bfffff at about 45%), "Technology" (#c1ffb1 at about 45%). Element boxes as the app draws them (2px navy stroke, bold IBM Plex Sans label): Mainframe = Node (technology fill #c1ffb1, 3px corners, small node glyph) centred in the Technology band; Financial Transaction Processing = Business Function (business fill #fffbe6, 10px rounded corners, function glyph) centre of the Business band; Finance Department = Business Actor (business fill, square corners, small stick-figure glyph) to its right, joined to it by an assignment arrow (dot at the Department end, filled arrowhead at the function).
Scene 1 (cue "insurance company"): kicker sets in; the three empty bands draw in from left, staggered.
Scene 2 (cue "old mainframe"): the Mainframe box rises into the Technology band.
Scene 3 (cue "finance team"): Financial Transaction Processing and Finance Department rise into the Business band, then the assignment arrow draws. On "S.A.P." an Application Component box "SAP ERP" rises into the centre of the Application band.
Scene 4 (cue "show how"): a dashed grey vertical line draws from the Mainframe up behind SAP ERP to Financial Transaction Processing, and a navy hop badge with "?" pops on each side of SAP ERP. Hold.

narrativeRole: give a newcomer the whole case in one picture.
keyMessage: one machine at the bottom, the finance work at the top, SAP in between, and no known route.

## Frame 2 — The table

- scene: The Appendix B cell for Node → Business Function, letters f i O r t v; only O is capital
- voiceover: "In ArchiMate, the mainframe is a Node. The finance work is a Business Function. The relationship table says they can connect. But through what?"
- duration: 12.04s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-the-table.html
- type: problem
- persuasion: Negative contrast
- beat: frustration
- asset_candidates:

Reused from the first draft; retimed to the new line. Headers appear on "Node" and "Business Function", the letters type on "can connect", "Allowed. But through what?" on "through what".

## Frame 3 — ArchiTrek

- scene: Navy ground, the ArchiTrek logo draws on, line "Find the route. Read the rule."
- voiceover: "ArchiTrek finds the route."
- duration: 2.84s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-architrek.html
- type: product_intro
- persuasion: Friction reduction
- beat: relief
- asset_candidates: assets/logo.svg — ArchiTrek logo, white

Reused from the first draft.

## Frame 4 — Pick

- scene: The real waypoint editor with Node and Business Function, push-in to the two cards then to Find Path
- voiceover: "Pick Node and Business Function, then click Find Path."
- duration: 6.32s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/04-pick.html
- type: key_feature
- persuasion: Show-don't-tell proof
- beat: ease
- blueprint: device-surface-showcase (Adapt)
- focal: assets/c01-edit-2wp.png
- asset_candidates: assets/c01-edit-2wp.png — waypoint editor with two cards, A START Node and B END Business Function, and the Find Path button

Adapted from the first draft's Frame 4 (same window, camera and highlight box). Regions (viewport px): card A x 14–254, y 99–207. Card B x 290–530, y 99–207. Find Path button x 1801–1916, y 174–218.
Scene 1 (cue "Node"): kicker "1 · PICK"; push in to the two cards; highlight card A on "Node", card B on "Business Function".
Scene 2 (cue "click Find Path"): camera travels to Find Path, highlight lands on it with one press. Hold.

## Frame 5 — Routes

- scene: Results for Node → Business Function: five legal routes, all through technology elements
- voiceover: "Five legal routes. But not one of them passes through SAP."
- duration: 7.44s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-routes.html
- type: key_feature
- persuasion: Negative contrast
- beat: tension
- blueprint: device-surface-showcase (Adapt)
- focal: assets/c02-routes-direct.png
- asset_candidates: assets/c02-routes-direct.png — results: diagram Node → Business Function, route list with five routes marked Simplified

Adapted from the first draft's Frame 5. Regions (viewport px): diagram x 790–1130, y 150–206 (Node and Business Function boxes). Route list rows x 30–700, y 670–830 (Route 1 y 670–695 … Route 5 y 802–825). The five routes in the app are: direct; via Device; via System Software; via Technology Event; via Technology Function. None passes through the Application layer, so none passes through SAP.
Scene 1 (cue "Every route"): kicker "2 · SEARCH"; push to the route list; ticks on the five rows, top to bottom, through "legal".
Scene 2 (cue "not one"): a label card sets in beside the list: "0 routes through SAP" (navy text, white card, square corners, the 0 in orange). Hold.

## Frame 6 — Steer

- scene: Add Application Component as a waypoint, then the swimlane view shows the route climbing through the Application band
- voiceover: "So pin SAP in the middle, as an Application Component. Now every route has to pass through it."
- duration: 8.28s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-steer.html
- type: key_feature
- persuasion: Control
- beat: control
- blueprint: device-surface-showcase (Adapt)
- focal: assets/s02-edit.png
- asset_candidates: assets/s02-edit.png — waypoint editor with three cards A START Node, B VIA Application Component, C END Business Function; assets/s09-swimlanes.png — swimlane view: Business, Application, Technology bands, the route climbs from Node through Application Component and Application Function to Business Function

Regions in s02-edit (viewport px): cards row y 99–207; card B (VIA Application Component) x 290–530. Regions in s09-swimlanes: the diagram with bands spans about x 20–1900, y 100–560 in the top half; Business band at top, Application middle, Technology bottom; the route boxes: Node lower-left in Technology, Application Component and Application Function in the Application band, Business Function upper-right in Business.
Scene 1 (cue "pin SAP"): kicker "3 · STEER"; s02-edit pushed in on the cards row; on "Application Component" an orange highlight outlines card B and a navy tag "SAP ERP" sets under it.
Scene 2 (cue "Now every route"): crossfade inside the window to s09-swimlanes.png framed on the diagram bands (about 1.6×), with a "SAP ERP" tag under the Application Component box; on "through it" the highlight box outlines the Application band row holding the two application boxes. Hold.

## Frame 7 — Decide

- scene: Right-click menu on a hop with the relationship types, then the decided route
- voiceover: "Right-click each hop to choose its relationship."
- duration: 3.88s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-decide.html
- type: key_feature
- persuasion: Control
- beat: control
- asset_candidates: assets/s04-ctx-menu.png — right-click menu; assets/s05-route.png — decided route

Reused from the first draft (was Frame 6); kicker becomes "4 · DECIDE"; retimed.

## Frame 8 — Read why

- scene: The step-by-step justification panel
- voiceover: "Every hop comes with its rule, and its section of the specification."
- duration: 5.56s
- transition_in: crossfade
- status: animated
- src: compositions/frames/08-read-why.html
- type: key_feature
- persuasion: Authority by association
- beat: trust
- asset_candidates: assets/s06-explain.png — Step-by-step justification

Reused from the first draft (was Frame 7); kicker becomes "5 · UNDERSTAND"; retimed.

## Frame 9 — Export

- scene: The download popover, XML highlighted, label "Open Exchange XML → Archi"
- voiceover: "Export to Archi, and keep modelling."
- duration: 4.48s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/09-export.html
- type: key_feature
- persuasion: Value stacking
- beat: satisfaction
- asset_candidates: assets/s08-download.png — download popover

Reused from the first draft's Frame 9 with only the XML highlight (on "export") and the label (on "Archi"); kicker becomes "6 · TAKE IT TO ARCHI".

## Frame 10 — Rigor

- scene: Semantic rigor, the three presets as three quick beats on the real app
- voiceover: "And you set how strict the search is. Academic, strict enough for exams. Pragmatic, balanced. Discovery, loose, for exploring."
- duration: 8s
- transition_in: crossfade
- status: animated
- src: compositions/frames/10-rigor.html
- type: key_feature
- persuasion: Control
- beat: control
- blueprint: device-surface-showcase (Adapt)
- focal: the Semantic rigor control and the results under each preset
- asset_candidates: assets/r0-options.png, assets/r1-academic.png, assets/r2-pragmatic.png, assets/r3-discovery.png

Scene 1 (cue "how strict"): kicker "7 · RIGOR"; the Options panel with Semantic rigor, push-in on the control.
Scenes 2–4 (cues "Academic", "Pragmatic", "Discovery"): hard cuts between the same search under each preset, each with a label card naming the preset and its app wording (Strict, Balanced, Loose).

## Frame 11 — And more

- scene: Rapid montage of other features, one cut per spoken item, accelerating
- voiceover: "And there's so much more. Viewpoints. Evidence labels. Spec definitions. Swimlanes. Share links. Story themes, from a hospital to the Death Star."
- duration: 9s
- transition_in: crossfade
- status: animated
- src: compositions/frames/11-more.html
- type: key_feature
- persuasion: Abundance
- beat: momentum
- blueprint: compose
- focal: real screenshots, one per feature
- asset_candidates: assets/m1-viewpoints.png … assets/m8-swimlanes.png

The one deliberate montage in the video. Each spoken item cuts to its screenshot, pushed in on the region that shows it, with a short label card. Cuts get faster towards the end and the last item holds.

## Frame 12 — Your turn

- scene: Back to the case picture; the Mainframe gives way to a dashed "Cloud server", and the open questions hang over the technology layer and the arrows
- voiceover: "Your turn. The company wants to swap the mainframe for a cloud server. Which elements change? Which arrows? Model it with ArchiTrek."
- duration: 10.32s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/12-your-turn.html
- type: cta
- persuasion: Open loop
- beat: curiosity + motivation
- blueprint: compose
- focal: the case picture from Frame 1, rebuilt in this frame
- asset_candidates:

Layout: the same three bands and element boxes as Frame 1 (same positions and styling), with the route now filled in: Mainframe (Node) in Technology, one Application Component box "SAP ERP" in the Application band, Financial Transaction Processing and Finance Department in Business; solid navy arrows Mainframe → SAP ERP (realization: dashed line with hollow triangle) and SAP ERP → Financial Transaction Processing (serving: solid line, open arrowhead). Kicker "YOUR TURN" top-left.
Scene 1 (from 0, cue "swap the mainframe"): the filled-in picture is already on screen at t=0 (it is the answer to Frame 1). On "swap the mainframe", the Mainframe box dims to 35% and a dashed-outline box labelled "Cloud server" (no fill, 2px dashed navy, square corners) slides in to its right inside the Technology band, with a small grey arrow from Mainframe to it.
Scene 2 (cue "Which elements change?"): an orange outline frames the Technology band.
Scene 3 (cue "Which arrows?"): the orange outline moves off the band; the two arrows between the layers turn dashed grey, each with a navy hop badge reading "?".
Scene 4 (cue "Model it with"): a white card with the ArchiTrek logo-on-light (assets/logo-on-light.svg) and the line "architrek.hronmichal.net" sets in at the right side, above the caption band. Hold to the end.

narrativeRole: hand the next assignment to the viewer.
keyMessage: now model the migration yourself.

## Frame 13 — End card

- scene: Navy end card with the ArchiTrek logo and the address
- voiceover: ""
- duration: 3s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/13-end-card.html
- type: brand_outro
- persuasion: Friction reduction
- beat: motivation
- asset_candidates: assets/logo.svg — ArchiTrek logo, white

Reused from the first draft; silent, so its reveals run on fixed times and it holds.
