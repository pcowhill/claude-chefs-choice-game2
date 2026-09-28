# RESEARCH.md

A short research pass ran before any code was written. Goals: find precedents
for the core mechanic, confirm the niche was open, avoid title collisions, and
pick licensing-safe assets.

## Inspiration & precedents

- **Dark Echo (RAC7, 2015)** — the strongest precedent for "sound is the only
  visual". Footsteps emit lines that bounce off walls; reviewers consistently
  called the mechanic tense and complete despite near-zero graphics. Takeaway:
  the perception mechanic carries a whole game — but Dark Echo is a linear
  maze-escape *puzzle*. Sources:
  [TouchArcade review](https://toucharcade.com/2015/02/11/dark-echo-review/),
  [Metacritic](https://www.metacritic.com/game/dark-echo/),
  [Pocket Gamer](https://www.pocketgamer.com/dark-echo/review/).
- **Sonar/submarine games generally** — searching "sonar roguelike submarine
  echolocation hunting" surfaces board games (*Captain Sonar*,
  [BGG](https://boardgamegeek.com/boardgame/171131/captain-sonar)), sub sims
  (*UBOAT*, [Vice](https://www.vice.com/en/article/uboat-recasts-the-sub-sim-as-a-roguelike-management-game/)),
  and exploration indies (*Sonar Scout*,
  [Steam](https://store.steampowered.com/app/3137740/Sonar_Scout/);
  *Sonar Ping*, [itch](https://jeremyedwards.itch.io/sonar-ping)) — but **no
  browser hunter-roguelite where the acoustic economy runs both ways**
  (your sounds reveal the world to you *and* you to the creatures). That gap
  is the game.
- **CRT/phosphor instrument aesthetics** — real P1-phosphor radar scopes,
  plus the general jam wisdom that a single committed palette + one bitmap
  font beats mixed asset packs for coherence.

## Title collision check

- "Dead Quiet" — taken by a
  [wild-west itch game](https://sintaxgames.itch.io/dead-quiet), plus *Deadly
  Quiet* on [Steam](https://store.steampowered.com/app/3419130/Deadly_Quiet/).
- "Hadal" — crowded on itch (Hadal Project, Project Hadal, HADAL, and more —
  e.g. [hisakiid.itch.io/hadal-project](https://hisakiid.itch.io/hadal-project)).
- **EARSHOT** — chosen: one word, names the actual mechanic (everything within
  earshot sees you; everything you hear, you see), no notable game collision
  found.

## Asset sources considered

- **VT323** (Peter Hull) via the Google Fonts repo — chosen for the CRT
  terminal look; SIL Open Font License 1.1 permits bundling. License
  confirmed at [Google Fonts](https://fonts.google.com/specimen/VT323) and
  [Font Squirrel](https://www.fontsquirrel.com/license/vt323); files pulled
  from [github.com/google/fonts](https://github.com/google/fonts/tree/main/ofl/vt323).
- **Kenney / OpenGameArt sprite & SFX packs** — considered and rejected:
  raster sprites would fight the vector-phosphor look, and sample-based audio
  would need pitch/pan work anyway. Procedural WebAudio synthesis fits the
  instrument fantasy better and keeps provenance trivial.

## Why this concept won (decision record)

Shortlisted concepts: a sonar hunter-roguelite; a reverse bullet-hell where
you build the boss's patterns; a constellation-drawing summoner; a time-loop
arena with ghost selves; a crokinole-style physics battler.

The sonar hunter won on four axes:

1. **Surprise × legibility** — one readable rule ("sound is light, for
   everyone") that generates stealth, hunting, baiting, and panic organically.
2. **Feasibility** — 2D canvas, circle wavefronts, segment raycasts: all
   well-understood tech, so the effort budget went to feel and balance.
3. **Aesthetic confidence** — the mechanic *demands* the phosphor-scope look;
   form and fiction reinforce each other with zero asset risk.
4. **Replayable depth** — procedural caves, four creature behaviors plus an
   unkillable finale, nine run-defining upgrades, and a score system that
   rewards silent kills and accuracy.
