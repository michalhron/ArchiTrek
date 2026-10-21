---
version: alpha
name: ArchiTrek — Frame (video layer)
description: >
  Video-first design system taken from the ArchiTrek web app itself (ui/styles.css). The navy header
  bar, the light grey canvas, white cards with 1px grey borders, square corners everywhere, IBM Plex
  Sans for all text, uppercase letter-spaced kicker labels (like ROUTE 1), ArchiMate layer colours on
  element boxes, and one small orange accent used sparingly. The app's own screenshots are the hero.
unit: the frame — 1920×1080
principle: the app's screens are the hero · atoms are sacred · square corners · one accent

colors:
  ink: "#1a2432"
  ink-2: "#2c3848"
  canvas: "#f7f7f7"
  surface: "#ffffff"
  diagram: "#eceef1"
  border: "#e5e7eb"
  text: "#1a2432"
  text-muted: "#4a5568"
  text-light: "#6b7280"
  accent: "#ff4500"
  accent-2: "#4a2d8a"
  layer-technology: "#c1ffb1"
  layer-application: "#bfffff"
  layer-business: "#fffbe6"
  layer-business-swatch: "#f5e87a"
  layer-motivation: "#e4d9f3"
  valid: "#1a7a3a"
  valid-bg: "#f0faf4"
  derived: "#7a4f00"
  derived-bg: "#fff8ec"
  hop-grey: "#94a3b8"

radii:
  none: "0"
  element: "3px"
  element-behavior: "10px"

typography:
  kicker:  { fontFamily: "IBM Plex Sans", px: 22, weight: 600, tracking: "0.16em", upper: true, color: "text-muted" }
  body:    { fontFamily: "IBM Plex Sans", px: 30, weight: 400, lineHeight: 1.45, color: "text-muted" }
  h2:      { fontFamily: "IBM Plex Sans", px: 64, weight: 700, lineHeight: 1.08, tracking: "-0.01em", color: "text" }
  h1:      { fontFamily: "IBM Plex Sans", px: 104, weight: 700, lineHeight: 1.02, tracking: "-0.015em", color: "text" }
  label:   { fontFamily: "IBM Plex Sans", px: 24, weight: 600, color: "text" }
  badge:   { fontFamily: "IBM Plex Sans", px: 22, weight: 500 }

fonts:
  display: "IBM Plex Sans"
  body: "IBM Plex Sans"

spacing:
  pad-x: "96px"
  pad-y: "88px"
  header-bar: "72px"

components:
  header-bar:
    backgroundColor: "{colors.ink}"
    description: "The app's navy top bar with the white ArchiTrek logo at left. Use as the title and end-card ground or as a thin top band."
  screen-frame:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "0"
    shadow: "0 24px 60px rgba(26,36,50,0.18)"
    description: "A real app screenshot shown as a window on the canvas. The only element allowed a soft shadow."
  kicker:
    description: "12px orange square, then uppercase letter-spaced label in text-muted. Mirrors ROUTE 1 / STEP-BY-STEP JUSTIFICATION in the app."
  element-box:
    border: "2px solid {colors.ink}"
    description: "ArchiMate element as the app draws it: layer fill, navy 2px stroke, bold label centred."
  hop-badge:
    backgroundColor: "{colors.ink}"
    description: "Small navy circle with a white hop number, as on the app's diagram."
  route-badge:
    description: "Outlined rectangle chip, square corners. Ground-Truth = valid green on valid-bg. Simplified = orange. Technology-Heavy = green fill."
  highlight-box:
    border: "3px solid {colors.accent}"
    description: "Orange rectangle drawn over a region of a screenshot to point at it. Square corners."
---

## Overview

The video should feel like the app. Most frames show a real ArchiTrek screen, framed as a window on the light canvas, with a push-in to the part that matters and an orange highlight box. Title and end cards use the navy header colour with the white logo.

## Do

- Use square corners on every card, frame and caption.
- Keep text in IBM Plex Sans. Kickers uppercase with wide tracking.
- Let the screenshot carry the information. Add at most one label or highlight at a time.

## Don't

- No gradients, glows, neon or glassmorphism.
- No rounded pills except ArchiMate behaviour elements, which the app draws rounded.
- No more than one orange accent in view at a time.
