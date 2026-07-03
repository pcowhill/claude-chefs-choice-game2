# DELIVERY_NOTES.md

## Final concept

**EARSHOT** — a top-down sonar hunter-roguelite for desktop browsers. The core
conceit: at crush depth there is no light, so *sound is the only light* — and
it is symmetric. Every sound (ping, engine, torpedo, blast, creature call)
paints phosphor echoes of the world around its source for the player, and
simultaneously tells the eyeless creatures where to hunt. A run descends six
procedural cave zones (cull quota → drop shaft → refit upgrade), ending in an
escape finale against an unkillable leviathan. 10–20 minutes per run,
score/rank chase and nine build-defining upgrades for replay.

## Implementation summary

Vite 7 + TypeScript (strict), **zero runtime dependencies**. ~7,000 lines.

- `src/engine/` — seeded RNG + geometry (`math.ts`), keyboard/mouse
  (`input.ts`), camera with lead + trauma shake (`camera.ts`), fixed 1920×1080
  letterboxed canvas, glow-sprite and cached glow-text helpers (`gfx.ts`),
  fully synthesized WebAudio engine with a shared feedback-delay cave-echo bus
  (`audio.ts`).
- `src/game/worldgen.ts` — cellular-automata caves, carved chamber network
  (spanning tree + extra loops), flood-fill connectivity repair,
  marching-squares wall segments, echo-dot sampling, spatial hashes, DDA
  raycasts, circle-vs-segment collision.
- `src/game/sound.ts` — the acoustic core: sound events feed a queue creatures
  consume; wavefronts expand and light terrain dots (with per-frame-budgeted
  occlusion raycasts), snapshot creature "ghosts", reveal hardware, and — when
  a *creature's* ping washes over you — mark you for the pack.
- `src/game/creatures.ts` — hearing-driven AI (lurk / investigate / hunt /
  flee / windup / charge / stunned) for drifter, stalker, screecher, mauler;
  segmented leviathan with its own terrifying full-map ping.
- `src/game/player.ts`, `objects.ts` — helm physics with flank meter and loud
  wall bumps, ping, lead-aimed torpedoes, decoys, mines with chain reactions,
  vents that mask engine noise, pickups; explosions double as pings and lures.
- `src/game/run.ts` — zone lifecycle, quotas, agitation director, emergency
  ammo-resupply fail-safe, upgrades, scoring/ranks.
- `src/game/render.ts`, `hud.ts`, `screens.ts` — phosphor renderer (echo dots,
  rings, ghosts, particles, vignette), instrument HUD (hull, tubes, decoys,
  flank, activity, hydrophone bearing scope), contextual tutorial, and title /
  briefing / refit / pause / death / victory screens, all drawn in-canvas.
- `scripts/` — Playwright verification suite (needs one-off
  `npm i -D playwright`; kept out of package.json so player installs stay
  light).

## Verification checklist

- [x] `npm install` clean (no vulnerabilities, light dependency tree)
- [x] `npm run typecheck` clean (strict TS)
- [x] `npm run build` clean (tsc + Vite; ~85 KB JS, ~31 KB gzipped)
- [x] Dev server boots; **production preview also verified** (non-blank pixel
      check on the rendered canvas)
- [x] First screen is not blank; font loads with fallback timeout
- [x] Title → briefing → gameplay reachable by click/keyboard
      (`scripts/verify.mjs`, screenshots reviewed for every state)
- [x] Pause menu (resume/restart/volume/mute/quit), blur auto-pause
- [x] Kill → quota → drop shaft → descend → refit → next zone, no debug used
      (autopilot soak, `scripts/soak.mjs`)
- [x] Death → stats/rank screen → `R` restart; victory → DAYLIGHT screen →
      restart; best score persisted (localStorage)
- [x] Deep zones fought naturally by the soak bot down to −1150 m
      (`scripts/soak-deep.mjs`); mines, maulers, screechers exercised
- [x] Finale pipeline natural win: leviathan ping marks beacon at ~10 s,
      ascent dwell completes with the creature active
      (`scripts/finale-check.mjs`)
- [x] Soft-lock fail-safe (0 ammo + quota + no supplies → emergency buoy)
      implemented after the soak exposed the gap, then re-verified
- [x] Frame rate in software-rendered headless Chromium: 60 fps title & normal
      play; ~50 fps deliberate worst case (full-map leviathan ping while
      hunted) after optimization passes (cached gradients, pre-rendered glow
      text, batched serpent strokes, occlusion-raycast budget)
- [x] Non-ASCII glyphs swept out of canvas strings (VT323 coverage)

### Checks not performed

- No human playtest of long-session balance beyond the scripted/autopilot runs
  (autopilot is omniscient, so *fairness-of-information* was validated by
  design review + screenshot inspection rather than blind play).
- No cross-browser matrix beyond Chromium (standard Canvas 2D / WebAudio APIs
  only; no known Firefox/Safari-specific usage).
- Audio output only verified through code review and API-level behavior —
  headless has no speakers.

## Known issues / limitations

- Momentary ~50 fps worst case on machines without GPU-accelerated canvas
  (degrades gracefully; fixed-timestep logic keeps game speed correct).
- Desktop keyboard+mouse only, by scope.
- Browser autoplay policy means audio starts after the first click (title
  screen's CLICK TO DIVE is that gesture).

## Branch / commit

- Branch: `claude/browser-game-one-shot-f9loq9`
- Implementation commit: `5f4450214c3c804e0d659bfe97eac62fc165075a`
  (this notes file lands in the follow-up commit on the same branch)
