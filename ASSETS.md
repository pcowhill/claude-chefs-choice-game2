# ASSETS.md

Every asset ships in this repo; nothing is hotlinked at runtime.

## External assets

| Asset | Files | Source | License | Use |
| --- | --- | --- | --- | --- |
| VT323 typeface by Peter Hull | `public/fonts/VT323-Regular.ttf`, `public/fonts/OFL.txt` | [google/fonts repo, `ofl/vt323`](https://github.com/google/fonts/tree/main/ofl/vt323) ([specimen](https://fonts.google.com/specimen/VT323)) | SIL Open Font License 1.1 (full text bundled in `public/fonts/OFL.txt`) | The game's only typeface: wordmark, HUD, all screens. Loaded via the FontFace API with a monospace fallback. |

The OFL permits bundling and redistribution with software; VT323's reserved
name is not used for any derivative font.

## Procedural / code-generated assets

- **All graphics** are drawn at runtime with Canvas 2D: cave walls as
  marching-squares echo dots, creatures as stroked vector silhouettes, the
  sub, wavefront rings, particles, HUD instruments, glow via pre-rendered
  radial-gradient sprites. No image files.
- **All audio** is synthesized at runtime with the WebAudio API
  (`src/engine/audio.ts`): sonar pings, torpedo launches/explosions, four
  creature voices plus the leviathan's foghorn, engine/prop loops, ambient
  drone, and UI blips — oscillators and filtered noise through a shared
  feedback-delay "cave echo" bus. No sample files.
- **Favicon** is an inline SVG data URI in `index.html` (drawn for this
  project).
- **CRT treatment** (scanlines, vignette, flicker) is CSS in `index.html`.
