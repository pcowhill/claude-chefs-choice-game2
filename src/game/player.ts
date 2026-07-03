// The sub: helm physics, ping, torpedoes, decoys, damage.

import { PLAYER, VENT } from '../config'
import { clamp, lerp, dist, angleTo } from '../engine/math'
import type { Run, IO } from './types'
import { collideCircle, raycastT } from './worldgen'
import { emitSound, pushWavefront } from './sound'
import { pushTicker, spawnBurst } from './effects'

export function updatePlayer(run: Run, io: IO, dt: number): void {
  const p = run.player
  const { input, audio } = io
  if (p.dead) return

  p.iframes = Math.max(0, p.iframes - dt)
  p.bumpCd = Math.max(0, p.bumpCd - dt)
  p.pingCd = Math.max(0, p.pingCd - dt)
  p.reload = Math.max(0, p.reload - dt)
  p.hurtFlash = Math.max(0, p.hurtFlash - dt)

  // ---- helm ----------------------------------------------------------
  const turn = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? -1 : 0) +
               (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0)
  const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
              (input.isDown('KeyS') || input.isDown('ArrowDown') ? PLAYER.reverseFactor : 0)
  if (turn !== 0 || fwd !== 0) run.hints.moved = true

  p.heading += turn * PLAYER.turnRate * dt

  const wantFlank = input.isDown('ShiftLeft') || input.isDown('ShiftRight')
  p.flanking = wantFlank && p.flankMeter > 0.02 && fwd > 0
  if (p.flanking) {
    p.flankMeter = Math.max(0, p.flankMeter - PLAYER.flankDrain * run.d.flankDrainMult * dt)
    p.flankRegenT = PLAYER.flankRegenDelay
  } else {
    p.flankRegenT = Math.max(0, p.flankRegenT - dt)
    if (p.flankRegenT <= 0) p.flankMeter = Math.min(1, p.flankMeter + PLAYER.flankRegen * dt)
  }

  const boost = p.flanking ? PLAYER.flankMult : 1
  const accel = PLAYER.accel * boost * run.d.speedMult
  p.vx += Math.cos(p.heading) * accel * fwd * dt
  p.vy += Math.sin(p.heading) * accel * fwd * dt
  const drag = Math.exp(-PLAYER.drag * dt)
  p.vx *= drag
  p.vy *= drag
  const spd = Math.hypot(p.vx, p.vy)
  const maxSpd = PLAYER.maxSpeed * boost * run.d.speedMult
  if (spd > maxSpd) {
    p.vx = (p.vx / spd) * maxSpd
    p.vy = (p.vy / spd) * maxSpd
  }
  p.x += p.vx * dt
  p.y += p.vy * dt

  // wall collision - bumps are LOUD
  const col = collideCircle(run.world, p.x, p.y, PLAYER.radius)
  if (col.hit) {
    p.x = col.x
    p.y = col.y
    const into = p.vx * -col.nx + p.vy * -col.ny  // speed into the wall
    if (into > 0) {
      p.vx += col.nx * into * 1.18   // kill normal velocity + slight bounce
      p.vy += col.ny * into * 1.18
    }
    if (into > 95 && p.bumpCd <= 0) {
      p.bumpCd = 0.5
      const loud = PLAYER.noiseWallBump * clamp(into / 260, 0.5, 1.3) * run.d.noiseMult
      emitSound(run, { x: p.x, y: p.y, loud, kind: 'bump', src: 'player' })
      audio.wallBump(clamp(into / 260, 0.4, 1))
      run.camera.addShake(0.16)
      spawnBurst(run, p.x - col.nx * PLAYER.radius, p.y - col.ny * PLAYER.radius, 'spark', 5, 90, 0.4, 1.8)
    }
  }

  // throttle smoothing (drives engine audio + noise level)
  const throttleTarget = Math.abs(fwd) > 0 ? clamp(spd / PLAYER.maxSpeed, 0.35, p.flanking ? 1.6 : 1) : spd / PLAYER.maxSpeed * 0.5
  p.throttle = lerp(p.throttle, throttleTarget, 1 - Math.exp(-6 * dt))
  audio.setEngine(clamp(p.throttle, 0, 1), p.flanking)

  // vent masking: park in the vent-wash to run quiet
  let ventMask = 1
  for (const v of run.vents) {
    if (dist(p.x, p.y, v.x, v.y) < VENT.maskRadius) { ventMask = VENT.maskFactor; break }
  }

  // continuous engine noise emissions
  p.engineNoiseT -= dt
  if (p.engineNoiseT <= 0) {
    p.engineNoiseT = PLAYER.engineNoiseInterval
    const spdN = clamp(spd / PLAYER.maxSpeed, 0, 1)
    let loud = lerp(PLAYER.noiseIdle, PLAYER.noiseCruise, spdN)
    if (p.flanking) loud = PLAYER.noiseFlank
    loud *= run.d.noiseMult * ventMask
    emitSound(run, { x: p.x, y: p.y, loud, kind: 'engine', src: 'player' }, spdN > 0.25)
    // prop wash
    if (spdN > 0.3) {
      const bx = p.x - Math.cos(p.heading) * 15
      const by = p.y - Math.sin(p.heading) * 15
      spawnBurst(run, bx, by, 'bubble', p.flanking ? 2 : 1, 26, 0.55, 1.6)
    }
  }

  // ---- active sonar ---------------------------------------------------
  const wantPing = input.wasPressed('Space') || input.rmbPressed
  if (wantPing && p.pingCd <= 0) {
    p.pingCd = PLAYER.pingCooldown * run.d.pingCdMult
    run.stats.pings++
    run.hints.pinged = true
    audio.ping()
    pushWavefront(run, {
      x: p.x, y: p.y,
      speed: PLAYER.pingSpeed,
      maxR: PLAYER.pingRadius * run.d.pingRadiusMult,
      strength: 1,
      revealTerrain: true,
      occlude: true,
      revealContacts: true,
      fromKind: 'player'
    })
    emitSound(run, { x: p.x, y: p.y, loud: PLAYER.noisePing * run.d.noiseMult, kind: 'ping', src: 'player' }, false)
  }

  // ---- weapons ----------------------------------------------------------
  p.aimX = run.camera.toWorldX(input.mouseX)
  p.aimY = run.camera.toWorldY(input.mouseY)

  if (input.lmbPressed && p.reload <= 0) {
    if (p.ammo > 0) {
      p.ammo--
      p.reload = PLAYER.torpReload * run.d.reloadMult
      run.stats.torpsFired++
      run.hints.fired = true
      const a = angleTo(p.x, p.y, p.aimX, p.aimY)
      const nx = p.x + Math.cos(a) * (PLAYER.radius + 8)
      const ny = p.y + Math.sin(a) * (PLAYER.radius + 8)
      run.torpedoes.push({
        x: nx, y: ny,
        vx: Math.cos(a) * PLAYER.torpSpeed + p.vx * 0.25,
        vy: Math.sin(a) * PLAYER.torpSpeed + p.vy * 0.25,
        life: PLAYER.torpLife,
        armT: 0.14,
        noiseT: 0,
        trail: [],
        dead: false
      })
      audio.torpedoLaunch()
      emitSound(run, { x: nx, y: ny, loud: 250 * run.d.noiseMult, kind: 'torpedo', src: 'player' })
      spawnBurst(run, nx, ny, 'bubble', 6, 60, 0.7, 2)
    } else {
      audio.uiMove()
      pushTicker(run, 'TUBES DRY - FIND SALVAGE', '#ffb454')
    }
  }

  if (input.wasPressed('KeyE')) {
    if (p.decoys > 0) {
      p.decoys--
      run.stats.decoysUsed++
      // throw toward cursor, stopped early by walls
      let tx = p.aimX, ty = p.aimY
      const d = dist(p.x, p.y, tx, ty)
      if (d > PLAYER.decoyRange) {
        tx = p.x + ((tx - p.x) / d) * PLAYER.decoyRange
        ty = p.y + ((ty - p.y) / d) * PLAYER.decoyRange
      }
      const t = raycastT(run.world, p.x, p.y, tx, ty)
      if (t <= 1) {
        tx = p.x + (tx - p.x) * t * 0.9
        ty = p.y + (ty - p.y) * t * 0.9
      }
      run.decoys.push({ x: tx, y: ty, life: PLAYER.decoyLife, chirpT: 0.2, dead: false })
      audio.uiSelect()
      pushTicker(run, 'DECOY AWAY')
    } else {
      audio.uiMove()
      pushTicker(run, 'NO DECOYS', '#ffb454')
    }
  }
}

export function damagePlayer(run: Run, io: IO, amount: number, knockX = 0, knockY = 0): void {
  const p = run.player
  if (p.dead || p.iframes > 0 || run.godMode) return
  p.hull -= amount
  p.iframes = PLAYER.contactIFrames
  p.hurtFlash = 0.55
  p.vx += knockX
  p.vy += knockY
  run.stats.damageTaken += amount
  run.camera.addShake(0.55)
  io.audio.hurt()
  spawnBurst(run, p.x, p.y, 'spark', 12, 160, 0.6, 2.2)
  if (p.hull <= 0) {
    p.hull = 0
    p.dead = true
    run.outcome = 'dead'
    spawnBurst(run, p.x, p.y, 'flash', 26, 240, 1.4, 3.4)
    spawnBurst(run, p.x, p.y, 'bubble', 30, 120, 2.2, 2.6)
    io.audio.explosion(0, 1)
    io.audio.deathToll()
    run.camera.addShake(1)
  } else {
    pushTicker(run, `HULL BREACH - ${Math.ceil(p.hull)}%`, '#ff5040')
  }
}
