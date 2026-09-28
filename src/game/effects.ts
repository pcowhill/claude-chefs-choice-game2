// Particles, tickers, score popups - pure data pushes, no game logic.

import { TICKER_TIME, COLORS } from '../config'
import type { Run, Particle } from './types'

export function pushTicker(run: Run, text: string, color = COLORS.phos): void {
  run.tickers.push({ text, t: TICKER_TIME, color })
  if (run.tickers.length > 4) run.tickers.shift()
}

export function pushPopup(run: Run, x: number, y: number, text: string): void {
  run.popups.push({ x, y, t: 0, text })
}

export function spawnBurst(
  run: Run, x: number, y: number,
  kind: Particle['kind'], n: number, speed: number, life: number, size = 2.4
): void {
  for (let i = 0; i < n; i++) {
    const a = run.rng.angle()
    const s = speed * run.rng.range(0.25, 1)
    run.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * run.rng.range(0.6, 1.3),
      maxLife: life,
      size: size * run.rng.range(0.7, 1.4),
      kind,
      drag: 2.8
    })
  }
  if (run.particles.length > 700) run.particles.splice(0, run.particles.length - 700)
}

export function updateParticles(run: Run, dt: number): void {
  for (let i = run.particles.length - 1; i >= 0; i--) {
    const p = run.particles[i]
    p.life -= dt
    if (p.life <= 0) { run.particles.splice(i, 1); continue }
    const k = Math.exp(-p.drag * dt)
    p.vx *= k
    p.vy *= k
    if (p.kind === 'bubble') p.vy -= 26 * dt   // bubbles rise
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  for (let i = run.popups.length - 1; i >= 0; i--) {
    run.popups[i].t += dt
    if (run.popups[i].t > 1.6) run.popups.splice(i, 1)
  }
  for (let i = run.tickers.length - 1; i >= 0; i--) {
    run.tickers[i].t -= dt
    if (run.tickers[i].t <= 0) run.tickers.splice(i, 1)
  }
}
