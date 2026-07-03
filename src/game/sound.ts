// The core conceit: sound is light. Every sound event
//   1. spawns an expanding wavefront that paints phosphor echoes of whatever
//      it touches (walls, creatures, hardware) - visible to the PLAYER,
//   2. is queued for creatures, which hunt by hearing alone.

import { ECHO, SCREECHER_PING, PLAYER } from '../config'
import type { Run, IO, SoundEvt, Creature, Ghost } from './types'
import { occludedPath } from './worldgen'
import { angleTo, dist, clamp } from '../engine/math'

export interface WavefrontOpts {
  x: number
  y: number
  speed: number
  maxR: number
  strength: number
  revealTerrain?: boolean
  occlude?: boolean
  revealContacts?: boolean
  fromKind?: 'player' | 'creature' | 'world'
  sourceCreature?: Creature | null
}

export function pushWavefront(run: Run, o: WavefrontOpts): void {
  run.wavefronts.push({
    x: o.x, y: o.y, r: 0,
    speed: o.speed,
    maxR: o.maxR,
    strength: o.strength,
    revealTerrain: o.revealTerrain ?? true,
    occlude: o.occlude ?? false,
    revealContacts: o.revealContacts ?? false,
    fromKind: o.fromKind ?? 'world',
    sourceCreature: o.sourceCreature ?? null
  })
}

/**
 * Emit a sound into the world. Queues it for creature hearing, adds a scope
 * blip, and (unless suppressed) paints a small local shimmer of terrain.
 */
export function emitSound(run: Run, evt: SoundEvt, shimmer = true): void {
  run.soundQueue.push(evt)

  if (shimmer && evt.loud > 60) {
    pushWavefront(run, {
      x: evt.x, y: evt.y,
      speed: 620,
      maxR: clamp(evt.loud * 0.42, 50, 300),
      strength: 0.34,
      revealTerrain: true,
      occlude: false,
      fromKind: evt.src
    })
  }

  // scope blips for things the hydrophone picks up (not your own engine)
  if (evt.src !== 'player' && evt.loud >= 100) {
    const p = run.player
    const d = dist(p.x, p.y, evt.x, evt.y)
    if (d < 2400) {
      const hostile = evt.src === 'creature'
      const kind = evt.kind === 'explosion' ? 'boom'
        : evt.kind === 'call' || evt.kind === 'screech' ? 'call'
        : 'noise'
      pushBlip(run, evt.x, evt.y, kind, hostile)
    }
  }
}

export function pushBlip(run: Run, x: number, y: number, kind: 'noise' | 'call' | 'boom' | 'ping', hostile: boolean): void {
  const p = run.player
  const d = dist(p.x, p.y, x, y)
  run.blips.push({
    bearing: angleTo(p.x, p.y, x, y),
    distNorm: clamp(d / 2200, 0.08, 1),
    t: run.time,
    kind,
    hostile
  })
  if (run.blips.length > 60) run.blips.splice(0, run.blips.length - 60)
}

/** Freeze a creature's outline onto the scope. */
export function snapshotGhost(run: Run, c: Creature, strength: number, fadeMult = 1): void {
  const alert = c.state === 'hunt' || c.state === 'charge' || c.state === 'windup' ? 2
    : c.state === 'investigate' || c.state === 'flee' ? 1 : 0
  const g: Ghost = {
    x: c.x, y: c.y,
    heading: c.heading,
    kind: c.kind,
    alert,
    t: run.time,
    fade: ECHO.ghostFade * run.d.echoFadeMult * fadeMult,
    strength,
    segs: c.segs ? c.segs.map((s) => ({ x: s.x, y: s.y })) : null
  }
  run.ghosts.push(g)
  if (run.ghosts.length > 150) run.ghosts.splice(0, run.ghosts.length - 150)
  // serpent ghosts are 13 subpaths each — keep only a short trail of them
  if (c.kind === 'leviathan') {
    let count = 0
    for (let i = run.ghosts.length - 1; i >= 0; i--) {
      if (run.ghosts[i].kind === 'leviathan') {
        count++
        if (count > 7) run.ghosts.splice(i, 1)
      }
    }
  }
}

/** Brighten a dot if this reveal beats what's already fading there. */
function lightDot(run: Run, di: number, strength: number): void {
  const dot = run.world.dots[di]
  const fade = ECHO.dotFade * run.d.echoFadeMult
  const current = dot.lit < 0 ? 0 : dot.glow * Math.max(0, 1 - (run.time - dot.lit) / fade)
  if (strength >= current) {
    dot.lit = run.time
    dot.glow = strength
  }
}

/** Light all dots within radius r of (x,y) - used for the hull's running lights. */
export function lightDotsCircle(run: Run, x: number, y: number, r: number, strength: number): void {
  const w = run.world
  const cs = 96
  const minX = Math.max(0, Math.floor((x - r) / cs))
  const maxX = Math.min(w.dotCols - 1, Math.floor((x + r) / cs))
  const minY = Math.max(0, Math.floor((y - r) / cs))
  const maxY = Math.min(w.dotRows - 1, Math.floor((y + r) / cs))
  const r2 = r * r
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      for (const di of w.dotBins[cx + cy * w.dotCols]) {
        const dot = w.dots[di]
        const dx = dot.x - x, dy = dot.y - y
        const d2 = dx * dx + dy * dy
        if (d2 <= r2) {
          const falloff = 1 - Math.sqrt(d2) / r
          lightDot(run, di, strength * (0.35 + 0.65 * falloff))
        }
      }
    }
  }
}

export function updatePerception(run: Run, io: IO, dt: number): void {
  const w = run.world
  const p = run.player
  // per-frame budget for acoustic-shadow raycasts; past it, dots just light.
  // Under heavy load this softens shadows for a frame instead of dropping fps.
  let occlBudget = 90

  // hull running lights: you always faintly see what you're about to hit
  lightDotsCircle(run, p.x, p.y, PLAYER.hullLightRadius, 0.3)

  for (let i = run.wavefronts.length - 1; i >= 0; i--) {
    const wf = run.wavefronts[i]
    const prevR = wf.r
    wf.r = Math.min(wf.maxR, wf.r + wf.speed * dt)

    if (wf.revealTerrain) {
      const cs = 96
      const minX = Math.max(0, Math.floor((wf.x - wf.r) / cs))
      const maxX = Math.min(w.dotCols - 1, Math.floor((wf.x + wf.r) / cs))
      const minY = Math.max(0, Math.floor((wf.y - wf.r) / cs))
      const maxY = Math.min(w.dotRows - 1, Math.floor((wf.y + wf.r) / cs))
      const lo2 = prevR * prevR
      const hi2 = wf.r * wf.r
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          // skip bins entirely inside the already-swept disc
          const bcx = cx * cs + cs / 2, bcy = cy * cs + cs / 2
          const bd = dist(bcx, bcy, wf.x, wf.y)
          if (bd + 70 < prevR || bd - 70 > wf.r) continue
          for (const di of w.dotBins[cx + cy * w.dotCols]) {
            const dot = w.dots[di]
            const dx = dot.x - wf.x, dy = dot.y - wf.y
            const d2 = dx * dx + dy * dy
            if (d2 <= lo2 || d2 > hi2) continue
            const d = Math.sqrt(d2)
            if (wf.occlude && d > 190 && occlBudget > 0) {
              occlBudget--
              if (occludedPath(w, wf.x, wf.y, dot.x, dot.y)) continue
            }
            const falloff = 1 - (d / wf.maxR) * 0.55
            lightDot(run, di, wf.strength * falloff)
          }
        }
      }
    }

    if (wf.revealContacts) {
      // creatures crossed by the front leave ghost snapshots
      for (const c of run.creatures) {
        if (c.dead) continue
        if (wf.sourceCreature === c) continue
        const d = dist(c.x, c.y, wf.x, wf.y)
        if (d > prevR && d <= wf.r) {
          if (wf.occlude && d > 220 && occludedPath(w, wf.x, wf.y, c.x, c.y)) continue
          snapshotGhost(run, c, wf.fromKind === 'player' ? 1 : 0.8)
          if (wf.fromKind === 'player' && !run.hints.sawContact) run.hints.sawContact = true
        }
      }
      // hardware markers
      for (const m of run.mines) {
        if (m.dead) continue
        const d = dist(m.x, m.y, wf.x, wf.y)
        if (d > prevR && d <= wf.r) m.seenT = run.time
      }
      for (const pk of run.pickups) {
        if (pk.dead) continue
        const d = dist(pk.x, pk.y, wf.x, wf.y)
        if (d > prevR && d <= wf.r) pk.seenT = run.time
      }
      for (const v of run.vents) {
        const d = dist(v.x, v.y, wf.x, wf.y)
        if (d > prevR && d <= wf.r) v.seenT = run.time
      }
      {
        const d = dist(w.hatchX, w.hatchY, wf.x, wf.y)
        if (d > prevR && d <= wf.r) w.hatchSeenT = run.time
      }
      if (run.zoneIdx === 5) {
        const d = dist(run.beaconX, run.beaconY, wf.x, wf.y)
        if (d > prevR && d <= wf.r) {
          run.beaconSeenT = run.time
          run.beaconKnown = true
        }
      }
    }

    // creature pings that wash over the player give your position away
    if (wf.fromKind === 'creature' && wf.sourceCreature) {
      const d = dist(p.x, p.y, wf.x, wf.y)
      if (d > prevR && d <= wf.r && !p.dead) {
        run.soundQueue.push({
          x: p.x, y: p.y,
          loud: SCREECHER_PING.alertRadius,
          kind: 'screech',
          src: 'player'
        })
        run.detectedFlash = 2.8
        if (run.detectedCd <= 0) {
          io.audio.detectedStinger()
          run.detectedCd = 3
        }
      }
    }

    if (wf.r >= wf.maxR) run.wavefronts.splice(i, 1)
  }

  // decay ghosts / blips
  for (let i = run.ghosts.length - 1; i >= 0; i--) {
    if (run.time - run.ghosts[i].t > run.ghosts[i].fade) run.ghosts.splice(i, 1)
  }
  for (let i = run.blips.length - 1; i >= 0; i--) {
    if (run.time - run.blips[i].t > ECHO.blipFade) run.blips.splice(i, 1)
  }
}
