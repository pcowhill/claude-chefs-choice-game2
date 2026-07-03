// Torpedoes, decoys, mines, pickups, vents - and the explosions that tie
// them together. Every explosion is also a ping and a lure.

import { PLAYER, MINE, VENT, PICKUP, CREATURES } from '../config'
import { clamp, dist } from '../engine/math'
import type { Run, IO } from './types'
import { raycastT } from './worldgen'
import { emitSound, pushWavefront } from './sound'
import { pushTicker, spawnBurst } from './effects'
import { damageCreature } from './creatures'
import { damagePlayer } from './player'

export function explodeAt(
  run: Run, io: IO, x: number, y: number,
  opts: { radius: number; playerDmg: number; creatureDmg: number; noise: number; reveal: number }
): void {
  const p = run.player
  const dp = dist(x, y, p.x, p.y)
  const sp = io.audio.spatial(x - p.x, dp)
  io.audio.explosion(sp.pan, Math.max(sp.gain, 0.25))
  run.camera.addShake(clamp(0.7 - dp / 1100, 0, 0.7))
  spawnBurst(run, x, y, 'flash', 18, 260, 0.5, 3.2)
  spawnBurst(run, x, y, 'spark', 22, 210, 0.8, 2.2)
  spawnBurst(run, x, y, 'bubble', 12, 90, 1.6, 2.4)

  // an explosion is a ping: it paints everything around it
  pushWavefront(run, {
    x, y,
    speed: 700,
    maxR: opts.reveal,
    strength: 0.9,
    revealTerrain: true,
    occlude: true,
    revealContacts: true,
    fromKind: 'world'
  })
  // ...and a dinner bell
  emitSound(run, { x, y, loud: opts.noise, kind: 'explosion', src: 'world' }, false)

  if (opts.playerDmg > 0 && !p.dead && dp < opts.radius + PLAYER.radius) {
    const falloff = 1 - dp / (opts.radius + PLAYER.radius)
    const a = Math.atan2(p.y - y, p.x - x)
    damagePlayer(run, io, Math.ceil(opts.playerDmg * clamp(falloff + 0.35, 0, 1)),
      Math.cos(a) * 320, Math.sin(a) * 320)
  }
  for (const c of run.creatures) {
    if (c.dead) continue
    if (dist(x, y, c.x, c.y) < opts.radius + CREATURES[c.kind].radius) {
      damageCreature(run, io, c, opts.creatureDmg, x, y)
    }
  }
  // chain reactions
  for (const m of run.mines) {
    if (!m.dead && m.fuse < 0 && dist(x, y, m.x, m.y) < MINE.chainRadius) {
      m.fuse = run.rng.range(0.1, 0.28)
    }
  }
}

export function updateTorpedoes(run: Run, io: IO, dt: number): void {
  for (const t of run.torpedoes) {
    if (t.dead) continue
    t.life -= dt
    t.armT -= dt
    if (t.life <= 0) {
      t.dead = true
      // fizzle: sinks quietly
      spawnBurst(run, t.x, t.y, 'bubble', 4, 40, 0.8, 1.6)
      continue
    }

    const nx = t.x + t.vx * dt
    const ny = t.y + t.vy * dt
    const hitT = raycastT(run.world, t.x, t.y, nx, ny)
    if (hitT <= 1) {
      t.dead = true
      const hx = t.x + (nx - t.x) * hitT
      const hy = t.y + (ny - t.y) * hitT
      const dp = dist(hx, hy, run.player.x, run.player.y)
      const sp = io.audio.spatial(hx - run.player.x, dp)
      io.audio.thunk(sp.pan, sp.gain)
      emitSound(run, { x: hx, y: hy, loud: 330, kind: 'impact', src: 'world' })
      spawnBurst(run, hx, hy, 'spark', 8, 130, 0.5, 2)
      continue
    }
    t.x = nx
    t.y = ny

    t.trail.push({ x: t.x, y: t.y })
    if (t.trail.length > 14) t.trail.shift()

    t.noiseT -= dt
    if (t.noiseT <= 0) {
      t.noiseT = 0.22
      emitSound(run, { x: t.x, y: t.y, loud: PLAYER.torpNoise, kind: 'torpedo', src: 'player' })
    }

    if (t.armT <= 0) {
      for (const c of run.creatures) {
        if (c.dead) continue
        let boom = dist(t.x, t.y, c.x, c.y) < PLAYER.torpProxFuse + CREATURES[c.kind].radius
        if (!boom && c.segs) {
          for (const s of c.segs) {
            if (dist(t.x, t.y, s.x, s.y) < PLAYER.torpProxFuse + 14) { boom = true; break }
          }
        }
        if (boom) {
          t.dead = true
          run.stats.torpsHit++
          explodeAt(run, io, t.x, t.y, {
            radius: 62 * run.d.blastMult,
            playerDmg: 14,
            creatureDmg: run.d.torpDamage,
            noise: PLAYER.explosionNoise,
            reveal: PLAYER.explosionReveal
          })
          break
        }
      }
    }
  }
  run.torpedoes = run.torpedoes.filter((t) => !t.dead)
}

export function updateDecoys(run: Run, io: IO, dt: number): void {
  for (const d of run.decoys) {
    if (d.dead) continue
    d.life -= dt
    if (d.life <= 0) { d.dead = true; continue }
    d.chirpT -= dt
    if (d.chirpT <= 0) {
      d.chirpT = PLAYER.decoyChirpInterval
      emitSound(run, {
        x: d.x, y: d.y,
        loud: PLAYER.decoyNoise * run.d.decoyNoiseMult,
        kind: 'decoy', src: 'world'
      })
      const dp = dist(d.x, d.y, run.player.x, run.player.y)
      const sp = io.audio.spatial(d.x - run.player.x, dp)
      io.audio.decoyChirp(sp.pan, sp.gain)
    }
  }
  run.decoys = run.decoys.filter((d) => !d.dead)
}

export function updateMines(run: Run, io: IO, dt: number): void {
  const p = run.player
  for (const m of run.mines) {
    if (m.dead) continue
    if (m.fuse < 0) {
      // dormant: proximity trigger
      if (!p.dead && dist(m.x, m.y, p.x, p.y) < MINE.proxPlayer + PLAYER.radius) {
        m.fuse = MINE.fuse
        m.seenT = run.time
        const sp = io.audio.spatial(m.x - p.x, dist(m.x, m.y, p.x, p.y))
        io.audio.mineBeep(sp.pan, 1)
      } else {
        for (const c of run.creatures) {
          if (c.dead || c.kind === 'drifter') continue
          if (dist(m.x, m.y, c.x, c.y) < MINE.proxCreature + CREATURES[c.kind].radius) {
            m.fuse = MINE.fuse
            m.seenT = run.time
            const sp = io.audio.spatial(m.x - p.x, dist(m.x, m.y, p.x, p.y))
            io.audio.mineBeep(sp.pan, sp.gain)
            break
          }
        }
      }
    } else {
      m.fuse -= dt
      if (m.fuse <= 0) {
        m.dead = true
        explodeAt(run, io, m.x, m.y, {
          radius: MINE.blastRadius,
          playerDmg: MINE.damagePlayer,
          creatureDmg: MINE.damageCreature,
          noise: MINE.noise,
          reveal: 520
        })
      }
    }
  }
  run.mines = run.mines.filter((m) => !m.dead)
}

export function updatePickups(run: Run, io: IO, dt: number): void {
  const p = run.player
  for (const pk of run.pickups) {
    if (pk.dead) continue
    pk.bob += dt
    if (!p.dead && dist(pk.x, pk.y, p.x, p.y) < PICKUP.radius + PLAYER.radius) {
      pk.dead = true
      io.audio.pickup()
      switch (pk.kind) {
        case 'torp': {
          run.player.ammo = Math.min(PLAYER.torpAmmoCap, run.player.ammo + PICKUP.torpAmount)
          pushTicker(run, `TORPEDO CACHE +${PICKUP.torpAmount}`)
          break
        }
        case 'salvage': {
          run.player.ammo = Math.min(PLAYER.torpAmmoCap, run.player.ammo + PICKUP.salvageTorps)
          pushTicker(run, `SALVAGED MUNITIONS +${PICKUP.salvageTorps}`)
          break
        }
        case 'repair': {
          run.player.hull = Math.min(run.d.hullMax, run.player.hull + PICKUP.repairAmount)
          pushTicker(run, `HULL PATCHED +${PICKUP.repairAmount}%`, '#b4ffd9')
          break
        }
        case 'decoy': {
          run.player.decoys = Math.min(run.d.decoyCap, run.player.decoys + PICKUP.decoyAmount)
          pushTicker(run, `DECOYS RESTOCKED +${PICKUP.decoyAmount}`)
          break
        }
      }
    }
  }
  run.pickups = run.pickups.filter((pk) => !pk.dead)
}

export function updateVents(run: Run, io: IO, dt: number): void {
  for (const v of run.vents) {
    v.t -= dt
    if (v.t <= 0) {
      v.t = run.rng.range(VENT.interval[0], VENT.interval[1])
      emitSound(run, { x: v.x, y: v.y, loud: VENT.noise, kind: 'vent', src: 'world' }, false)
      pushWavefront(run, {
        x: v.x, y: v.y,
        speed: 480,
        maxR: 205,
        strength: 0.42,
        revealTerrain: true,
        fromKind: 'world'
      })
      const dp = dist(v.x, v.y, run.player.x, run.player.y)
      if (dp < 900) {
        const sp = io.audio.spatial(v.x - run.player.x, dp)
        io.audio.ventPuff(sp.pan, sp.gain)
      }
      for (let i = 0; i < 5; i++) {
        run.particles.push({
          x: v.x + run.rng.range(-8, 8), y: v.y,
          vx: run.rng.range(-8, 8), vy: run.rng.range(-42, -20),
          life: run.rng.range(0.8, 1.7), maxLife: 1.7,
          size: run.rng.range(1.5, 3), kind: 'bubble', drag: 0.4
        })
      }
    }
  }
}
