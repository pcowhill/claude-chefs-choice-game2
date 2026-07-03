# EARSHOT

*A sonar hunt in the lightless deep. Nothing down here has eyes.*

EARSHOT is a top-down stealth-hunter roguelite played entirely on a phosphor
sonar scope. At crush depth there is no light — **sound is the only light**.
Every noise in the cave paints glowing echoes of whatever surrounds its source:
your ping sweeps the rock into view, your engine murmurs a faint halo around
your hull, a torpedo blast flash-photographs the whole cavern.

The catch: the creatures down here are eyeless too, and they hunt exactly the
same way. Everything that helps you see — moving fast, pinging, shooting —
tells the dark where you are. One rule drives the whole game:

> **If it makes sound, you can see it. If you make sound, they can find you.**

Descend through six procedurally generated cave zones, cull your contract
quota of contacts, refit your sub between depths, and survive the thing at the
bottom that a survey fleet did not.

## Why this concept

- **A surprising core mechanic that stays legible.** "Top-down sub combat" is
  instantly readable; making *perception itself* the resource you spend and
  leak is the twist. Games like *Dark Echo* proved sound-as-vision is
  mesmerizing, but nobody has built the hunter-roguelite version where the
  economy runs both ways (see `RESEARCH.md`).
- **Mechanics that genuinely interact.** Active sonar vs. passive listening,
  noise-based aggro, terrain occlusion, decoys, mines that hear, vents that
  mask your engine, explosions that double as pings and dinner bells — every
  system feeds the same acoustic model.
- **A strong visual point of view for free.** A sonar scope *should* look like
  a phosphor instrument, so the whole game commits to one confident look:
  VT323 terminal type, green phosphor on near-black, scanlines, echoes that
  decay like a real CRT. No sprites to clash, no generic web-app chrome.
- **Zero asset risk.** One OFL-licensed font; every graphic is drawn by code
  and every sound is synthesized in WebAudio.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Helm (thrust + turn) |
| `SHIFT` | Flank speed — fast and **very** loud |
| `SPACE` or Right mouse | Sonar ping (reveals, but they hear it) |
| Left mouse | Fire torpedo at cursor |
| `E` | Throw a noisemaker decoy at cursor |
| `P` / `ESC` | Pause (holding station) |
| `M` | Mute |
| `R` | Restart (from pause / death / victory) |
| `1` `2` `3` | Pick a refit upgrade |

Everything above is also taught in-game (title screen, contextual hints in
zone 1, and the pause menu's helm card). Best played with sound on — the
stereo hydrophone is a real navigation tool.

### Field notes for your first dive

- Sit still and listen first. Moving creatures betray themselves with scope
  blips and faint ghost outlines — you can hunt without ever pinging.
- Ping, then *relocate*. Hunters converge on where the ping came from, not
  where you are now.
- Drifters flee noise; stalkers charge it; screechers ping back (and rat you
  out); maulers wind up and charge in a straight line — bait them into rock or
  mines. The thing in zone six cannot be killed. Run.
- Explosions are pings. A torpedo into a far wall is also a flare — and a lure.
- Park in vent-wash to muffle your engine.

## Run it locally

Requires Node 20.19+ or 22.12+ (Vite 7).

```bash
npm install
npm run dev        # → http://localhost:5173
```

Build / preview a production bundle:

```bash
npm run build      # typechecks, then bundles to dist/
npm run preview    # serves dist/
npm run typecheck  # tsc --noEmit only
```

Desktop browsers only, tuned for 1080p (scales down cleanly to laptop sizes).

## What was verified

- `npm install`, `npm run typecheck`, and `npm run build` all pass clean.
- Playwright-driven checks against the real dev server *and* the production
  preview: first screen renders (non-blank pixel check), title → briefing →
  gameplay → pause → upgrade → next zone → death → restart → finale → victory
  all reachable; screenshots reviewed at every state.
- An omniscient autopilot soak-played full runs for ~20 minutes total:
  torpedo kills, quota/hatch flow, salvage/cache economy, the emergency
  resupply fail-safe, upgrade application, multi-zone descents (a bot run
  fought from −140 m to −1150 m), and a natural finale win (leviathan ping →
  beacon marked → ascent) were all exercised without debug teleports.
- Frame rate measured in *software-rendered* headless Chromium: 60 fps on
  title and normal play, ~50 fps in a deliberate worst case (leviathan hunt +
  full-map ping). Hardware-accelerated browsers have more headroom, and game
  logic runs on a fixed timestep either way.

The Playwright scripts used for all of this live in `scripts/` (they need a
one-off `npm i -D playwright`, which is intentionally not in
`package.json` so a normal install stays light).

## Known limitations

- Desktop keyboard + mouse only — no touch/gamepad support (by design).
- Audio requires one click/keypress to start (browser autoplay policy); the
  title screen's "click to dive" is that gesture.
- Worst-case frame rate on machines *without* GPU-accelerated canvas can dip
  to ~50 fps for a moment during full-map reveals; acoustic-shadow raycasts
  are budgeted per frame so it degrades gracefully.
- Balance is tuned for a first clear in roughly 3–6 attempts (10–20 minutes
  per run); seasoned players can chase S-rank scores and silent-kill bonuses.
