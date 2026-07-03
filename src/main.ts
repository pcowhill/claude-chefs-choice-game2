// Boot + main loop + debug hooks.

import { setupCanvas, loadFont } from './engine/gfx'
import { Input } from './engine/input'
import { AudioEngine } from './engine/audio'
import { createApp, updateApp, drawApp } from './game/screens'
import { startZone } from './game/run'
import { raycastT } from './game/worldgen'

async function boot(): Promise<void> {
  await loadFont()
  const gfx = setupCanvas()
  const input = new Input(gfx.canvas)
  const audio = new AudioEngine()
  const app = createApp({ input, audio })
  document.getElementById('boot')?.remove()

  window.addEventListener('blur', () => {
    if (app.state === 'playing') {
      app.state = 'paused'
      app.stateT = 0
      audio.setEngine(0, false)
      audio.setDanger(0)
    }
  })

  // Verification/debug hooks, active only with ?debug=1
  let autopilot: (() => void) | null = null
  if (new URLSearchParams(location.search).has('debug')) {
    let auto = false
    // Omniscient soak-test pilot: exercises the whole loop unattended.
    autopilot = () => {
      if (!auto) return
      for (const k of ['KeyW', 'KeyA', 'KeyD', 'ShiftLeft']) input.down.delete(k)
      if (app.state === 'title') { input.pressed.add('Enter'); return }
      if (app.state === 'briefing' && app.stateT > 0.7) { input.pressed.add('Space'); return }
      if (app.state === 'upgrade' && app.stateT > 0.4) { input.pressed.add('Digit1'); return }
      if ((app.state === 'dead' || app.state === 'won') && app.stateT > 1) { input.pressed.add('KeyR'); return }
      const r = app.run
      if (app.state !== 'playing' || !r || r.player.dead) return
      const p = r.player
      // final destination
      let tx: number, ty: number
      let hunting = false
      if (r.quota <= 0) {
        tx = r.zoneIdx === 5 ? r.beaconX : r.world.hatchX
        ty = r.zoneIdx === 5 ? r.beaconY : r.world.hatchY
        if (r.zoneIdx === 5 && !r.beaconKnown) {
          const ch = r.world.chambers[Math.floor(r.time / 6) % r.world.chambers.length]
          tx = ch.x; ty = ch.y
        }
      } else if (p.ammo === 0) {
        // dry: run for supplies, not teeth
        let best = Infinity
        tx = p.x; ty = p.y
        for (const pk of r.pickups) {
          if (pk.dead) continue
          const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2
          if (d < best) { best = d; tx = pk.x; ty = pk.y }
        }
      } else {
        let best = Infinity
        tx = p.x; ty = p.y
        for (const c of r.creatures) {
          if (c.dead || c.kind === 'leviathan') continue
          const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
          if (d < best) { best = d; tx = c.x; ty = c.y; hunting = true }
        }
        // top up from anything close by
        for (const pk of r.pickups) {
          if (pk.dead) continue
          const d = Math.hypot(pk.x - p.x, pk.y - p.y)
          if (d < 300) { tx = pk.x; ty = pk.y; hunting = false; break }
        }
      }
      // route via chambers when the direct path is blocked
      let wx = tx, wy = ty
      const clear = (ax: number, ay: number, bx: number, by: number): boolean =>
        raycastT(r.world, ax, ay, bx, by) > 1
      if (!clear(p.x, p.y, tx, ty)) {
        let bestCost = Infinity
        for (const ch of r.world.chambers) {
          const dMe = Math.hypot(ch.x - p.x, ch.y - p.y)
          if (dMe < 90 || !clear(p.x, p.y, ch.x, ch.y)) continue
          const cost = dMe + Math.hypot(tx - ch.x, ty - ch.y) * 1.4
          if (cost < bestCost) { bestCost = cost; wx = ch.x; wy = ch.y }
        }
      }
      let want = Math.atan2(wy - p.y, wx - p.x)
      // whisker: veer off walls
      const probe = 150
      const castA = (a: number): number =>
        raycastT(r.world, p.x, p.y, p.x + Math.cos(a) * probe, p.y + Math.sin(a) * probe)
      const tC = castA(want)
      if (tC < 1) {
        const tL = castA(want - 0.8)
        const tR = castA(want + 0.8)
        want += (tL > tR ? -1 : 1) * (1 - tC) * 1.8
      }
      let diff = want - p.heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (diff > 0.12) input.down.add('KeyD')
      else if (diff < -0.12) input.down.add('KeyA')
      const dist = Math.hypot(tx - p.x, ty - p.y)
      if (Math.abs(diff) < 1.15 && (dist > 110 || !hunting)) input.down.add('KeyW')
      if (p.pingCd <= 0 && r.time % 4 < 0.1) input.pressed.add('Space')
      if (hunting && dist < 430 && p.reload <= 0 && p.ammo > 0 && clear(p.x, p.y, tx, ty)) {
        input.mouseX = r.camera.toScreenX(tx)
        input.mouseY = r.camera.toScreenY(ty)
        input.lmbPressed = true
      }
    }
    const dbg = {
      setAuto: (v: boolean): void => { auto = v },
      app,
      state: () => ({
        state: app.state,
        zone: app.run ? app.run.zoneIdx : -1,
        hull: app.run ? Math.round(app.run.player.hull) : 0,
        ammo: app.run ? app.run.player.ammo : 0,
        quota: app.run ? app.run.quota : -1,
        score: app.run ? app.run.score : 0,
        creatures: app.run ? app.run.creatures.length : 0,
        dots: app.run ? app.run.world.dots.length : 0,
        time: app.run ? Math.round(app.run.time * 10) / 10 : 0
      }),
      god: (): void => { if (app.run) app.run.godMode = true },
      zone: (n: number): void => { if (app.run) startZone(app.run, n) },
      skipZone: (): void => {
        const r = app.run
        if (!r) return
        r.quota = 0
        if (r.zoneIdx === 5) {
          r.beaconKnown = true
          r.player.x = r.beaconX
          r.player.y = r.beaconY
        } else {
          r.hatchOpen = true
          r.player.x = r.world.hatchX
          r.player.y = r.world.hatchY
        }
      },
      die: (): void => {
        const r = app.run
        if (!r) return
        r.godMode = false
        r.player.hull = 0
        r.player.dead = true
        r.outcome = 'dead'
      },
      win: (): void => { if (app.run) app.run.outcome = 'won' }
    }
    ;(window as unknown as Record<string, unknown>).__earshot = dbg
  }

  let last = performance.now()
  let acc = 0
  const STEP = 1 / 60

  const frame = (now: number): void => {
    let dt = (now - last) / 1000
    last = now
    dt = Math.min(dt, 0.1)
    acc += dt
    let steps = 0
    while (acc >= STEP && steps < 5) {
      autopilot?.()
      updateApp(app, STEP)
      input.endFrame()
      acc -= STEP
      steps++
    }
    if (steps === 5) acc = 0
    drawApp(app, gfx.ctx)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

void boot()
