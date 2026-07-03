// Creature AI. Nothing down here has eyes: every behavior keys off the
// sound queue. Drifters flee noise, stalkers hunt it, screechers ping for it,
// maulers charge it, and the leviathan is a wall of ears.

import {
  CREATURES, SCREECHER_PING, MAULER, LEVIATHAN, AGITATION, PICKUP, SCORE,
  type CreatureKind
} from '../config'
import { clamp, dist, angleTo, turnToward } from '../engine/math'
import type { Run, IO, Creature, SoundEvt } from './types'
import { raycastT, collideCircle, occludedPath, isRoomyAt } from './worldgen'
import { emitSound, pushWavefront, snapshotGhost } from './sound'
import { pushTicker, pushPopup, spawnBurst } from './effects'
import { damagePlayer } from './player'

export function spawnCreature(run: Run, kind: CreatureKind, x: number, y: number): Creature {
  const def = CREATURES[kind]
  const c: Creature = {
    kind, x, y, vx: 0, vy: 0,
    heading: run.rng.angle(),
    hp: def.hp,
    state: 'lurk',
    stateT: 0,
    targetX: x, targetY: y,
    hasTarget: false,
    targetIsPlayer: false,
    wanderT: run.rng.range(0.5, 3),
    callT: run.rng.range(def.callInterval[0], def.callInterval[1]) * 0.5,
    moveNoiseT: run.rng.range(0, def.moveNoiseInterval),
    screechT: run.rng.range(SCREECHER_PING.interval[0], SCREECHER_PING.interval[1]),
    stun: 0,
    hitFlash: 0,
    everAlerted: false,
    contactCd: 0,
    dead: false,
    segs: null,
    levPingT: 3.5,
    flinch: 0
  }
  if (kind === 'leviathan') {
    c.segs = []
    for (let i = 0; i < LEVIATHAN.segments; i++) {
      c.segs.push({ x: x - (i + 1) * LEVIATHAN.segSpacing, y })
    }
  }
  return c
}

function agitMult(run: Run): number {
  return 1 + (run.agitation / 100) * AGITATION.maxHearingBonus
}

function markDetected(run: Run, io: IO, c: Creature): void {
  if (c.state !== 'hunt') {
    run.stats.timesDetected++
    run.detectedFlash = Math.max(run.detectedFlash, 2.8)
    if (run.detectedCd <= 0) {
      io.audio.detectedStinger()
      run.detectedCd = 3
    }
  }
}

function hear(run: Run, io: IO, c: Creature, evt: SoundEvt): void {
  if (evt.creature === c) return
  if (evt.src === 'creature') return          // they don't hunt each other
  if (evt.kind === 'vent') return             // habituated to the vents
  const def = CREATURES[c.kind]
  let effLoud = evt.loud * def.hearingMult * agitMult(run)
  const d = dist(c.x, c.y, evt.x, evt.y)
  if (d > effLoud) return
  if (d > 240 && occludedPath(run.world, c.x, c.y, evt.x, evt.y)) {
    effLoud *= 0.55
    if (d > effLoud) return
  }
  const fromPlayer = evt.src === 'player'
  if (fromPlayer) c.everAlerted = true

  switch (c.kind) {
    case 'drifter': {
      if (c.state !== 'flee') {
        c.state = 'flee'
        c.stateT = 0
      }
      c.targetX = evt.x
      c.targetY = evt.y
      c.hasTarget = true
      break
    }
    case 'mauler': {
      if (c.state === 'windup' || c.state === 'charge' || c.state === 'stunned') break
      if (d < effLoud * 0.9) {
        c.state = 'windup'
        c.stateT = 0
        c.targetX = evt.x
        c.targetY = evt.y
        c.hasTarget = true
        c.targetIsPlayer = fromPlayer
        const sp = io.audio.spatial(c.x - run.player.x, dist(c.x, c.y, run.player.x, run.player.y))
        io.audio.call('windup', sp.pan, sp.gain)
        snapshotGhost(run, c, 0.95)   // the roar gives it away
      } else {
        c.state = 'investigate'
        c.stateT = 0
        c.targetX = evt.x
        c.targetY = evt.y
        c.hasTarget = true
        c.targetIsPlayer = fromPlayer
      }
      break
    }
    default: {
      // stalker / screecher / leviathan
      if (c.state === 'charge' || c.state === 'stunned') break
      const escalate = fromPlayer &&
        (evt.kind === 'screech' || d < effLoud * 0.55 ||
          c.state === 'investigate' || c.state === 'hunt')
      if (escalate) {
        markDetected(run, io, c)
        c.state = 'hunt'
        c.stateT = 0
      } else if (c.state !== 'hunt') {
        c.state = 'investigate'
        c.stateT = 0
      }
      c.targetX = evt.x
      c.targetY = evt.y
      c.hasTarget = true
      c.targetIsPlayer = fromPlayer
      break
    }
  }
}

/** Steer toward (tx,ty) at `speed`, casting whiskers to slide around rock. */
function steer(run: Run, c: Creature, tx: number, ty: number, speed: number, accel: number, dt: number): void {
  let dir = angleTo(c.x, c.y, tx, ty)
  const spd = Math.hypot(c.vx, c.vy)
  const probeLen = clamp(spd * 0.6 + 46, 60, 165)
  const cast = (a: number): number =>
    raycastT(run.world, c.x, c.y, c.x + Math.cos(a) * probeLen, c.y + Math.sin(a) * probeLen)
  const tC = cast(dir)
  if (tC < 1) {
    const tL = cast(dir - 0.75)
    const tR = cast(dir + 0.75)
    const away = tL > tR ? -1 : 1
    dir += away * (1 - Math.min(tC, 1)) * 1.9
  }
  const dvx = Math.cos(dir) * speed
  const dvy = Math.sin(dir) * speed
  c.vx += clamp(dvx - c.vx, -accel * dt, accel * dt)
  c.vy += clamp(dvy - c.vy, -accel * dt, accel * dt)
}

function pickWanderTarget(run: Run, c: Creature): void {
  for (let i = 0; i < 8; i++) {
    const a = run.rng.angle()
    const d = run.rng.range(220, 640)
    const tx = c.x + Math.cos(a) * d
    const ty = c.y + Math.sin(a) * d
    if (isRoomyAt(run.world, tx, ty)) {
      c.targetX = tx
      c.targetY = ty
      c.hasTarget = true
      return
    }
  }
}

export function updateCreatures(run: Run, io: IO, dt: number): void {
  const evts = run.soundQueue.splice(0)
  const p = run.player

  for (const c of run.creatures) {
    if (c.dead) continue
    const def = CREATURES[c.kind]

    for (const evt of evts) hear(run, io, c, evt)

    c.stateT += dt
    c.contactCd = Math.max(0, c.contactCd - dt)
    c.hitFlash = Math.max(0, c.hitFlash - dt)

    // ---- state behavior -------------------------------------------------
    let moveSpeed = 0
    let mx = c.targetX, my = c.targetY

    switch (c.state) {
      case 'lurk': {
        c.targetIsPlayer = false
        c.wanderT -= dt
        if (c.wanderT <= 0 || !c.hasTarget) {
          c.wanderT = run.rng.range(2.5, 6)
          if (c.kind === 'leviathan') {
            const ch = run.rng.pick(run.world.chambers)
            c.targetX = ch.x
            c.targetY = ch.y
            c.hasTarget = true
          } else {
            pickWanderTarget(run, c)
          }
        }
        moveSpeed = def.cruise
        if (dist(c.x, c.y, c.targetX, c.targetY) < 50) moveSpeed = def.cruise * 0.25
        break
      }
      case 'investigate': {
        const arrived = dist(c.x, c.y, mx, my) < 55
        if (!arrived) {
          moveSpeed = c.kind === 'stalker' ? def.hunt * 0.8 : Math.min(def.cruise * 1.7, def.hunt)
          c.stateT = 0
        } else {
          // circle the point, listening
          const a = angleTo(mx, my, c.x, c.y) + 1.25
          mx = mx + Math.cos(a) * 90
          my = my + Math.sin(a) * 90
          moveSpeed = def.cruise
          if (c.stateT > def.investigateTime) {
            c.state = 'lurk'
            c.stateT = 0
            c.hasTarget = false
          }
        }
        break
      }
      case 'hunt': {
        // close-range wake sensing: they feel the water you push
        const dp = dist(c.x, c.y, p.x, p.y)
        if (c.targetIsPlayer && !p.dead && dp < 215 && !occludedPath(run.world, c.x, c.y, p.x, p.y)) {
          c.targetX = p.x
          c.targetY = p.y
        }
        moveSpeed = def.hunt
        if (c.kind === 'stalker') {
          // lunge-drift-lunge rhythm
          const s = Math.sin(c.stateT * 3.1)
          moveSpeed = def.hunt * (0.5 + 0.5 * s * s)
        }
        if (dist(c.x, c.y, mx, my) < 46) {
          c.state = 'investigate'
          c.stateT = 0.01
        }
        break
      }
      case 'flee': {
        const a = angleTo(c.targetX, c.targetY, c.x, c.y)
        mx = c.x + Math.cos(a) * 300
        my = c.y + Math.sin(a) * 300
        moveSpeed = def.hunt
        if (c.stateT > 3.6) {
          c.state = 'lurk'
          c.stateT = 0
          c.hasTarget = false
        }
        break
      }
      case 'windup': {
        moveSpeed = 0
        c.heading = turnToward(c.heading, angleTo(c.x, c.y, c.targetX, c.targetY), 4.5 * dt)
        if (c.stateT >= MAULER.windup) {
          c.state = 'charge'
          c.stateT = 0
          const a = angleTo(c.x, c.y, c.targetX, c.targetY)
          c.vx = Math.cos(a) * MAULER.chargeSpeed
          c.vy = Math.sin(a) * MAULER.chargeSpeed
          emitSound(run, { x: c.x, y: c.y, loud: MAULER.chargeNoise, kind: 'move', src: 'creature', creature: c })
        }
        break
      }
      case 'charge': {
        // no steering: a thrown boulder with teeth
        const spd = Math.hypot(c.vx, c.vy)
        const look = spd * dt + def.radius + 10
        const t = raycastT(run.world, c.x, c.y, c.x + (c.vx / spd) * look, c.y + (c.vy / spd) * look)
        if (t <= 1) {
          c.state = 'stunned'
          c.stateT = 0
          c.stun = MAULER.wallStun
          c.vx *= -0.15
          c.vy *= -0.15
          emitSound(run, { x: c.x, y: c.y, loud: 560, kind: 'impact', src: 'creature', creature: c })
          snapshotGhost(run, c, 1)
          spawnBurst(run, c.x, c.y, 'spark', 14, 200, 0.7, 2.6)
          const dp = dist(c.x, c.y, p.x, p.y)
          run.camera.addShake(clamp(1 - dp / 900, 0, 0.5))
          const sp = io.audio.spatial(c.x - p.x, dp)
          io.audio.thunk(sp.pan, sp.gain * 1.5)
        } else if (c.stateT > MAULER.chargeTime) {
          c.state = 'investigate'
          c.stateT = 0
        }
        break
      }
      case 'stunned': {
        moveSpeed = 0
        c.vx *= Math.exp(-4 * dt)
        c.vy *= Math.exp(-4 * dt)
        if (c.stateT >= c.stun) {
          c.state = 'investigate'
          c.stateT = 0
        }
        break
      }
    }

    // leviathan flinches off torpedo hits
    if (c.flinch > 0) {
      c.flinch -= dt
      const a = angleTo(p.x, p.y, c.x, c.y)
      mx = c.x + Math.cos(a) * 400
      my = c.y + Math.sin(a) * 400
      moveSpeed = def.hunt * 0.9
    }

    if (c.state !== 'charge' && c.state !== 'windup' && moveSpeed > 0) {
      steer(run, c, mx, my, moveSpeed, def.accel, dt)
    } else if (c.state !== 'charge') {
      c.vx *= Math.exp(-2.4 * dt)
      c.vy *= Math.exp(-2.4 * dt)
    }

    c.x += c.vx * dt
    c.y += c.vy * dt
    const col = collideCircle(run.world, c.x, c.y, def.radius * 0.8)
    if (col.hit) {
      c.x = col.x
      c.y = col.y
    }

    const spd = Math.hypot(c.vx, c.vy)
    if (c.state !== 'windup' && spd > 24) {
      c.heading = turnToward(c.heading, Math.atan2(c.vy, c.vx), def.turnRate * 1.6 * dt * (1 + spd / 100))
    }

    // ---- sounds the creature makes (= how you see it) ---------------------
    c.moveNoiseT -= dt
    if (c.moveNoiseT <= 0) {
      c.moveNoiseT = def.moveNoiseInterval
      if (spd > 28) {
        const f = clamp(spd / def.hunt, 0.25, 1.15) * (c.state === 'flee' ? 1.35 : 1)
        emitSound(run, { x: c.x, y: c.y, loud: def.moveNoise * f, kind: 'move', src: 'creature', creature: c })
        snapshotGhost(run, c, clamp(0.42 * run.d.hydrophoneMult, 0, 0.8), 0.75 * run.d.hydrophoneMult)
        const dp = dist(c.x, c.y, p.x, p.y)
        if (dp < 760) {
          const sp = io.audio.spatial(c.x - p.x, dp)
          io.audio.swish(sp.pan, sp.gain * f)
        }
      }
    }

    c.callT -= dt * (1 + (run.agitation / 100) * AGITATION.maxCallRateBonus)
    if (c.callT <= 0 && def.callNoise > 0) {
      c.callT = run.rng.range(def.callInterval[0], def.callInterval[1])
      emitSound(run, { x: c.x, y: c.y, loud: def.callNoise, kind: 'call', src: 'creature', creature: c })
      snapshotGhost(run, c, clamp(0.8 * run.d.hydrophoneMult, 0, 1))
      const dp = dist(c.x, c.y, p.x, p.y)
      const sp = io.audio.spatial(c.x - p.x, dp)
      io.audio.call(c.kind, sp.pan, sp.gain)
    }

    if (c.kind === 'screecher') {
      c.screechT -= dt
      if (c.screechT <= 0) {
        c.screechT = run.rng.range(SCREECHER_PING.interval[0], SCREECHER_PING.interval[1])
        const dp = dist(c.x, c.y, p.x, p.y)
        const sp = io.audio.spatial(c.x - p.x, dp)
        io.audio.screechPing(sp.pan, sp.gain)
        pushWavefront(run, {
          x: c.x, y: c.y,
          speed: SCREECHER_PING.speed,
          maxR: SCREECHER_PING.radius,
          strength: 0.55,
          revealTerrain: true,
          occlude: true,
          revealContacts: true,
          fromKind: 'creature',
          sourceCreature: c
        })
        snapshotGhost(run, c, 1)
        emitSound(run, { x: c.x, y: c.y, loud: 460, kind: 'screech', src: 'creature', creature: c }, false)
      }
    }

    if (c.kind === 'leviathan') {
      updateLeviathanBody(run, io, c, dt)
    }

    // ---- contact damage ---------------------------------------------------
    if (!p.dead && c.contactCd <= 0) {
      const hitR = def.radius + 13 + 2
      let touching = dist(c.x, c.y, p.x, p.y) < hitR
      if (!touching && c.segs) {
        for (let i = 0; i < c.segs.length; i += 2) {
          if (dist(c.segs[i].x, c.segs[i].y, p.x, p.y) < hitR - 4) { touching = true; break }
        }
      }
      if (touching) {
        c.contactCd = 0.9
        const a = angleTo(c.x, c.y, p.x, p.y)
        const knock = c.kind === 'leviathan' ? 430 : 240
        damagePlayer(run, io, def.contactDamage, Math.cos(a) * knock, Math.sin(a) * knock)
        snapshotGhost(run, c, 1)
        if (c.state === 'charge') {
          c.state = 'investigate'
          c.stateT = 0
        }
      }
    }
  }
}

function updateLeviathanBody(run: Run, io: IO, c: Creature, dt: number): void {
  const p = run.player
  // body chain follows the head
  if (c.segs) {
    let px = c.x, py = c.y
    for (const s of c.segs) {
      const d = dist(s.x, s.y, px, py)
      if (d > LEVIATHAN.segSpacing) {
        const k = (d - LEVIATHAN.segSpacing) / d
        s.x += (px - s.x) * k
        s.y += (py - s.y) * k
      }
      px = s.x
      py = s.y
    }
  }

  c.levPingT -= dt
  if (c.levPingT <= 0) {
    c.levPingT = LEVIATHAN.pingInterval
    const dp = dist(c.x, c.y, p.x, p.y)
    const sp = io.audio.spatial(c.x - p.x, dp)
    io.audio.call('leviathan', sp.pan, clamp(sp.gain * 1.5, 0, 1))
    pushWavefront(run, {
      x: c.x, y: c.y,
      speed: LEVIATHAN.pingSpeed,
      maxR: LEVIATHAN.pingRadius,
      strength: 0.7,
      revealTerrain: true,
      occlude: true,
      revealContacts: true,
      fromKind: 'creature',
      sourceCreature: c
    })
    snapshotGhost(run, c, 1, 1.6)
    run.camera.addShake(clamp(0.5 - dp / 3000, 0, 0.5))
    if (!run.beaconKnown) {
      run.beaconKnown = true
      pushTicker(run, 'ASCENT STATION TRANSPONDER ACQUIRED - BEARING MARKED', '#ffb454')
    }
  }
}

export function damageCreature(run: Run, io: IO, c: Creature, dmg: number, _srcX: number, _srcY: number): void {
  if (c.dead) return
  const p = run.player
  const def = CREATURES[c.kind]
  const dp = dist(c.x, c.y, p.x, p.y)
  const sp = io.audio.spatial(c.x - p.x, dp)

  if (c.kind === 'leviathan') {
    c.flinch = LEVIATHAN.flinchTime
    c.everAlerted = true
    io.audio.call('mauler', sp.pan, clamp(sp.gain * 1.4, 0, 1))
    snapshotGhost(run, c, 1)
    pushTicker(run, 'DIRECT HIT - NO EFFECT', '#ffb454')
    return
  }

  c.hp -= dmg
  c.hitFlash = 0.3
  snapshotGhost(run, c, 1)

  if (c.hp <= 0) {
    c.dead = true
    run.stats.kills++
    run.stats.killsByKind[c.kind] = (run.stats.killsByKind[c.kind] ?? 0) + 1
    const silent = !c.everAlerted
    if (silent) run.stats.silentKills++
    const pts = Math.round(def.score * (silent ? SCORE.silentKillMult : 1))
    run.score += pts
    pushPopup(run, c.x, c.y, silent ? `SILENT KILL +${pts}` : `+${pts}`)
    run.agitation = Math.min(100, run.agitation + AGITATION.killSpike)
    io.audio.creatureDeath(sp.pan, Math.max(sp.gain, 0.35))
    spawnBurst(run, c.x, c.y, 'debris', 16, 170, 1.1, 2.8)
    spawnBurst(run, c.x, c.y, 'bubble', 10, 80, 1.8, 2.2)
    emitSound(run, { x: c.x, y: c.y, loud: 420, kind: 'call', src: 'creature', creature: c })
    if (run.quota > 0) {
      run.quota--
      pushTicker(run, run.quota > 0
        ? `CONTACT DESTROYED - ${run.quota} REMAIN`
        : 'QUOTA MET - DROP SHAFT UNLOCKED', run.quota > 0 ? '#3dd68c' : '#b4ffd9')
    }
    const dropChance = p.ammo < 3 ? 1 : PICKUP.salvageChance
    if (run.rng.chance(dropChance)) {
      run.pickups.push({ kind: 'salvage', x: c.x, y: c.y, seenT: run.time, bob: 0, dead: false })
    }
  } else {
    // it survived, and now it knows roughly where the shot came from
    c.everAlerted = true
    markDetected(run, io, c)
    c.state = 'hunt'
    c.stateT = 0
    c.targetX = p.x + run.rng.range(-110, 110)
    c.targetY = p.y + run.rng.range(-110, 110)
    c.hasTarget = true
    c.targetIsPlayer = true
    io.audio.call(c.kind === 'mauler' ? 'mauler' : 'stalker', sp.pan, clamp(sp.gain * 1.2, 0, 1))
  }
}
