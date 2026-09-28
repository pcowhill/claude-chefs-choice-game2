// Run orchestration: zone lifecycle, per-frame update order, derived stats,
// scoring. One Run = one dive.

import {
  ZONES, PLAYER, UPGRADES, SCORE, AGITATION, LEVIATHAN, DESCEND_HEAL,
  type CreatureKind, type UpgradeDef
} from '../config'
import { RNG, clamp, dist } from '../engine/math'
import { Camera } from '../engine/camera'
import type { Run, IO, DerivedStats, World } from './types'
import { generateWorld, randomOpenPoint } from './worldgen'
import { spawnCreature, updateCreatures } from './creatures'
import { updatePlayer } from './player'
import { updateTorpedoes, updateDecoys, updateMines, updatePickups, updateVents } from './objects'
import { updatePerception, pushWavefront } from './sound'
import { updateParticles, pushTicker } from './effects'

export function computeDerived(upgrades: Set<string>): DerivedStats {
  return {
    noiseMult: upgrades.has('laminar') ? 0.65 : 1,
    echoFadeMult: upgrades.has('phosphor') ? 1.7 : 1,
    reloadMult: upgrades.has('autoloader') ? 0.6 : 1,
    torpDamage: upgrades.has('warheads') ? 2 : 1,
    blastMult: upgrades.has('warheads') ? 1.55 : 1,
    pingRadiusMult: upgrades.has('broadband') ? 1.4 : 1,
    pingCdMult: upgrades.has('broadband') ? 0.75 : 1,
    decoyCap: PLAYER.decoyCap + (upgrades.has('decoys') ? 2 : 0),
    decoyNoiseMult: upgrades.has('decoys') ? 1.35 : 1,
    hullMax: PLAYER.hullMax + (upgrades.has('plating') ? 30 : 0),
    flankDrainMult: upgrades.has('flank') ? 0.5 : 1,
    speedMult: upgrades.has('flank') ? 1.08 : 1,
    hydrophoneMult: upgrades.has('towed') ? 1.6 : 1
  }
}

export function newRun(seed = (Math.random() * 0xffffffff) >>> 0): Run {
  const rng = new RNG(seed)
  const upgrades = new Set<string>()
  const run: Run = {
    rng,
    seed,
    time: 0,
    zoneIdx: 0,
    zone: ZONES[0],
    world: null as unknown as World,   // set by startZone below
    player: {
      x: 0, y: 0, vx: 0, vy: 0, heading: 0, throttle: 0,
      hull: PLAYER.hullMax,
      flankMeter: 1, flankRegenT: 0, flanking: false,
      pingCd: 0,
      ammo: PLAYER.torpAmmoStart,
      reload: 0,
      decoys: PLAYER.decoyStart,
      iframes: 0, engineNoiseT: 0, bumpCd: 0,
      aimX: 0, aimY: 0,
      dwell: 0, hurtFlash: 0,
      dead: false
    },
    creatures: [],
    torpedoes: [],
    decoys: [],
    mines: [],
    pickups: [],
    vents: [],
    particles: [],
    wavefronts: [],
    ghosts: [],
    blips: [],
    quota: 0,
    hatchOpen: false,
    agitation: 0,
    score: 0,
    stats: {
      kills: 0, killsByKind: {}, silentKills: 0,
      torpsFired: 0, torpsHit: 0, pings: 0, decoysUsed: 0,
      damageTaken: 0, timesDetected: 0, timeElapsed: 0
    },
    upgrades,
    d: computeDerived(upgrades),
    camera: new Camera(),
    tickers: [],
    popups: [],
    hints: { moved: false, pinged: false, heardWarning: false, sawContact: false, fired: false, killed: false, warnT: 0 },
    detectedFlash: 0,
    detectedCd: 0,
    zoneTime: 0,
    beaconX: 0, beaconY: 0, beaconKnown: false, beaconSeenT: -999,
    outcome: 'playing',
    godMode: false,
    resupplyCd: 0,
    soundQueue: []
  }
  startZone(run, 0)
  return run
}

export function startZone(run: Run, idx: number): void {
  run.zoneIdx = idx
  run.zone = ZONES[idx]
  const zone = run.zone
  const world = generateWorld(run.rng, zone)
  run.world = world

  run.creatures = []
  run.torpedoes = []
  run.decoys = []
  run.mines = []
  run.pickups = []
  run.vents = []
  run.particles = []
  run.wavefronts = []
  run.ghosts = []
  run.blips = []
  run.soundQueue = []
  run.popups = []
  run.tickers = []

  const p = run.player
  p.x = world.spawnX
  p.y = world.spawnY
  p.vx = 0
  p.vy = 0
  p.heading = Math.atan2(world.hpx / 2 - p.y, world.wpx / 2 - p.x)
  p.throttle = 0
  p.pingCd = 0
  p.reload = 0
  p.iframes = 2.2
  p.dwell = 0
  p.dead = false
  if (idx > 0) p.hull = Math.min(run.d.hullMax, p.hull + DESCEND_HEAL)

  run.quota = zone.quota
  run.hatchOpen = zone.quota === 0 && idx < 5
  run.agitation = 0
  run.zoneTime = 0
  run.detectedFlash = 0
  run.outcome = 'playing'
  run.beaconKnown = false
  run.beaconSeenT = -999
  run.beaconX = world.hatchX
  run.beaconY = world.hatchY

  // ---- populate -----------------------------------------------------------
  const placed: { x: number; y: number; d: number }[] = [
    { x: p.x, y: p.y, d: 720 }
  ]
  const spawnKinds: CreatureKind[] = []
  for (const [kind, count] of Object.entries(zone.spawns) as [CreatureKind, number][]) {
    for (let i = 0; i < count; i++) spawnKinds.push(kind)
  }
  for (const kind of spawnKinds) {
    const minD = kind === 'leviathan' ? 1000 : 720
    placed[0].d = minD
    let pt = randomOpenPoint(run.rng, world, placed)
    if (!pt) {
      placed[0].d = 480
      pt = randomOpenPoint(run.rng, world, placed)
    }
    if (!pt) continue
    run.creatures.push(spawnCreature(run, kind, pt.x, pt.y))
    placed.push({ x: pt.x, y: pt.y, d: 260 })
  }

  const hatchGuard = { x: world.hatchX, y: world.hatchY, d: 260 }
  const mineCons: { x: number; y: number; d: number }[] = [
    { x: p.x, y: p.y, d: 560 }, hatchGuard
  ]
  for (let i = 0; i < zone.mines; i++) {
    const pt = randomOpenPoint(run.rng, world, mineCons)
    if (!pt) continue
    run.mines.push({ x: pt.x, y: pt.y, fuse: -1, seenT: -999, dead: false })
    mineCons.push({ x: pt.x, y: pt.y, d: 150 })
  }

  const pickCons: { x: number; y: number; d: number }[] = [{ x: p.x, y: p.y, d: 380 }]
  const addPickup = (kind: 'torp' | 'repair' | 'decoy'): void => {
    const pt = randomOpenPoint(run.rng, world, pickCons)
    if (!pt) return
    run.pickups.push({ kind, x: pt.x, y: pt.y, seenT: -999, bob: run.rng.range(0, 6), dead: false })
    pickCons.push({ x: pt.x, y: pt.y, d: 220 })
  }
  for (let i = 0; i < zone.caches; i++) addPickup('torp')
  for (let i = 0; i < zone.repairs; i++) addPickup('repair')
  for (let i = 0; i < zone.decoys; i++) addPickup('decoy')

  const ventCons: { x: number; y: number; d: number }[] = []
  for (let i = 0; i < zone.vents; i++) {
    const pt = randomOpenPoint(run.rng, world, ventCons)
    if (!pt) continue
    run.vents.push({ x: pt.x, y: pt.y, t: run.rng.range(0.5, 3), seenT: -999 })
    ventCons.push({ x: pt.x, y: pt.y, d: 340 })
  }

  run.camera.snapTo(p.x, p.y)
  pushTicker(run, `DEPTH ${zone.depth}M - ${zone.name}`, '#b4ffd9')
  if (idx === 5) pushTicker(run, 'FIND THE ASCENT STATION. STAY QUIET.', '#ffb454')
}

export function updatePlaying(run: Run, io: IO, dt: number): void {
  const prevZoneT = run.zoneTime
  run.time += dt
  run.zoneTime += dt
  run.stats.timeElapsed += dt
  run.detectedFlash = Math.max(0, run.detectedFlash - dt)
  run.detectedCd = Math.max(0, run.detectedCd - dt)
  run.agitation = Math.min(100, run.agitation + AGITATION.ramp * dt)

  // silent systems-check sweep just after arrival: orients you, wakes nothing
  if (prevZoneT < 0.7 && run.zoneTime >= 0.7) {
    pushWavefront(run, {
      x: run.player.x, y: run.player.y,
      speed: 640, maxR: 560, strength: 0.75,
      revealTerrain: true, occlude: true, revealContacts: true,
      fromKind: 'player'
    })
  }

  updatePlayer(run, io, dt)
  updateTorpedoes(run, io, dt)
  updateDecoys(run, io, dt)
  updateMines(run, io, dt)
  updateVents(run, io, dt)
  updatePickups(run, io, dt)
  updatePerception(run, io, dt)
  updateCreatures(run, io, dt)
  run.creatures = run.creatures.filter((c) => !c.dead)
  updateParticles(run, dt)

  const p = run.player

  // emergency resupply: never strand the player dry with a quota to fill
  run.resupplyCd = Math.max(0, run.resupplyCd - dt)
  if (run.quota > 0 && p.ammo === 0 && run.torpedoes.length === 0 && run.resupplyCd <= 0) {
    const supplied = run.pickups.some((pk) => !pk.dead && (pk.kind === 'torp' || pk.kind === 'salvage'))
    if (!supplied) {
      run.resupplyCd = 10
      for (let i = 0; i < 60; i++) {
        const pt = randomOpenPoint(run.rng, run.world, [{ x: p.x, y: p.y, d: 320 }], 40)
        if (!pt) continue
        if (dist(pt.x, pt.y, p.x, p.y) > 1100) continue
        run.pickups.push({ kind: 'torp', x: pt.x, y: pt.y, seenT: run.time, bob: 0, dead: false })
        pushTicker(run, 'EMERGENCY SUPPLY BUOY DROPPED - MARKED ON SCOPE', '#ffb454')
        io.audio.pickup()
        break
      }
    }
  }

  // quota → open the drop shaft
  if (!run.hatchOpen && run.zoneIdx < 5 && run.quota <= 0) {
    run.hatchOpen = true
    run.world.hatchSeenT = run.time
    io.audio.upgradeStinger()
    pushTicker(run, 'DROP SHAFT BEARING MARKED ON SCOPE', '#b4ffd9')
  }

  // hatch / beacon dwell
  const finale = run.zoneIdx === 5
  const hx = finale ? run.beaconX : run.world.hatchX
  const hy = finale ? run.beaconY : run.world.hatchY
  const canUse = finale ? run.beaconKnown : run.hatchOpen
  if (!p.dead && canUse && dist(p.x, p.y, hx, hy) < 58) {
    p.dwell += dt
    const need = finale ? LEVIATHAN.beaconDwell : 0.9
    if (p.dwell >= need) {
      run.outcome = finale ? 'won' : 'descend'
    }
  } else {
    p.dwell = Math.max(0, p.dwell - dt)
  }

  // danger layer: closest creature actively hunting you
  let danger = 0
  for (const c of run.creatures) {
    if (c.dead) continue
    const hunting = (c.state === 'hunt' && c.targetIsPlayer) || c.state === 'charge' ||
      (c.kind === 'leviathan' && c.state === 'hunt')
    if (!hunting) continue
    const d = dist(c.x, c.y, p.x, p.y)
    danger = Math.max(danger, clamp(1 - d / 850, 0, 1))
  }
  io.audio.setDanger(p.dead ? 0 : danger)

  const leadX = (p.aimX - p.x) * 0.16
  const leadY = (p.aimY - p.y) * 0.16
  run.camera.update(dt, p.x, p.y, leadX, leadY, run.world.wpx, run.world.hpx)
}

export function zoneClearBonus(run: Run): number {
  const pts = Math.round(SCORE.zoneClearBase + run.zone.depth * SCORE.zoneClearPerDepth)
  run.score += pts
  return pts
}

export interface ScoreBreakdown {
  hunting: number
  zones: number
  accuracy: number
  hull: number
  win: number
  total: number
}

export function finalizeScore(run: Run, won: boolean): ScoreBreakdown {
  const acc = run.stats.torpsFired > 0 ? run.stats.torpsHit / run.stats.torpsFired : 0
  const accuracy = Math.round(acc * SCORE.accuracyBonusMax)
  const hull = won ? Math.round(run.player.hull * SCORE.hullBonusPerPoint) : 0
  const win = won ? SCORE.winBonus : 0
  const hunting = run.score
  const total = hunting + accuracy + hull + win
  run.score = total
  return { hunting, zones: 0, accuracy, hull, win, total }
}

export function rankFor(score: number): { rank: string; line: string } {
  for (const r of SCORE.ranks) {
    if (score >= r.min) return { rank: r.rank, line: r.line }
  }
  return { rank: 'D', line: SCORE.ranks[SCORE.ranks.length - 1].line }
}

export function rollUpgradeChoices(run: Run): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => !run.upgrades.has(u.id))
  const picks: UpgradeDef[] = []
  while (picks.length < 3 && pool.length > 0) {
    const i = Math.floor(run.rng.next() * pool.length)
    picks.push(pool.splice(i, 1)[0])
  }
  return picks
}

export function applyUpgrade(run: Run, u: UpgradeDef): void {
  run.upgrades.add(u.id)
  run.d = computeDerived(run.upgrades)
  if (u.id === 'plating') run.player.hull = Math.min(run.d.hullMax, run.player.hull + 30)
  if (u.id === 'decoys') run.player.decoys = Math.min(run.d.decoyCap, run.player.decoys + 2)
}
