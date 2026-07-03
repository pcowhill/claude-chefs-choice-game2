// Procedural cavern generation + spatial queries.
// Grid of solid cells → CA smoothing → carved chambers/corridors →
// marching-squares wall contours → echo dots sampled along walls.

import { CELL, SEG_HASH_CELL, DOT_HASH_CELL, ECHO, type ZoneDef } from '../config'
import { RNG, TAU, clamp, closestPointOnSeg, raySegIntersect } from '../engine/math'
import type { Seg, World, EchoDot } from './types'

export function generateWorld(rng: RNG, zone: ZoneDef): World {
  const gw = zone.gw
  const gh = zone.gh
  let solid = new Uint8Array(gw * gh)
  const idx = (x: number, y: number): number => x + y * gw

  // 1. random fill + solid border
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const border = x < 3 || y < 3 || x >= gw - 3 || y >= gh - 3
      solid[idx(x, y)] = border || rng.next() < zone.fillChance ? 1 : 0
    }
  }

  // 2. cellular automata smoothing
  const smooth = (times: number): void => {
    for (let it = 0; it < times; it++) {
      const next = new Uint8Array(gw * gh)
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          if (x < 2 || y < 2 || x >= gw - 2 || y >= gh - 2) { next[idx(x, y)] = 1; continue }
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              n += solid[idx(x + dx, y + dy)]
            }
          }
          next[idx(x, y)] = n >= 5 ? 1 : n <= 3 ? 0 : solid[idx(x, y)]
        }
      }
      solid = next
    }
  }
  smooth(4)

  // 3. chambers spread across the map, connected by wobbly corridors
  const chambers: { x: number; y: number }[] = []
  const nChambers = Math.floor((gw * gh) / 900) + 6
  let guard = 0
  while (chambers.length < nChambers && guard++ < 4000) {
    const cx = rng.int(8, gw - 9)
    const cy = rng.int(8, gh - 9)
    if (chambers.every((c) => (c.x - cx) ** 2 + (c.y - cy) ** 2 > 15 * 15)) {
      chambers.push({ x: cx, y: cy })
    }
  }

  const carveDisc = (cx: number, cy: number, r: number): void => {
    for (let y = Math.max(2, cy - r); y <= Math.min(gh - 3, cy + r); y++) {
      for (let x = Math.max(2, cx - r); x <= Math.min(gw - 3, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) solid[idx(x, y)] = 0
      }
    }
  }

  const carveCorridor = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.ceil(len * 1.5)
    const perpX = -(b.y - a.y) / (len || 1)
    const perpY = (b.x - a.x) / (len || 1)
    const amp = rng.range(1.5, 4.5)
    const freq = rng.range(1.5, 3.5)
    const phase = rng.angle()
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const wob = Math.sin(t * freq * TAU + phase) * amp * Math.sin(t * Math.PI)
      const x = Math.round(a.x + (b.x - a.x) * t + perpX * wob)
      const y = Math.round(a.y + (b.y - a.y) * t + perpY * wob)
      carveDisc(x, y, rng.chance(0.25) ? 3 : 2)
    }
  }

  for (const c of chambers) carveDisc(c.x, c.y, rng.int(4, 7))
  // connect each chamber to its nearest already-connected chamber (spanning tree)
  const connected = [chambers[0]]
  const pending = chambers.slice(1)
  while (pending.length > 0) {
    let bi = 0, bj = 0, bd = Infinity
    for (let i = 0; i < pending.length; i++) {
      for (let j = 0; j < connected.length; j++) {
        const d = (pending[i].x - connected[j].x) ** 2 + (pending[i].y - connected[j].y) ** 2
        if (d < bd) { bd = d; bi = i; bj = j }
      }
    }
    carveCorridor(pending[bi], connected[bj])
    connected.push(pending.splice(bi, 1)[0])
  }
  // a few extra loops so the cave isn't a pure tree
  for (let i = 0; i < Math.floor(nChambers / 3); i++) {
    carveCorridor(rng.pick(chambers), rng.pick(chambers))
  }

  smooth(1)

  // 4. connectivity repair + flood fill from first chamber
  const reach = new Uint8Array(gw * gh)
  const flood = (): void => {
    reach.fill(0)
    const q = [idx(chambers[0].x, chambers[0].y)]
    reach[q[0]] = 1
    while (q.length > 0) {
      const i = q.pop()!
      const x = i % gw, y = Math.floor(i / gw)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const ni = idx(nx, ny)
        if (!solid[ni] && !reach[ni]) { reach[ni] = 1; q.push(ni) }
      }
    }
  }
  carveDisc(chambers[0].x, chambers[0].y, 4)
  flood()
  for (const c of chambers) {
    if (!reach[idx(c.x, c.y)]) {
      carveDisc(c.x, c.y, 4)
      carveCorridor(c, chambers[0])
    }
  }
  flood()
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] && !reach[i]) solid[i] = 1   // seal unreachable pockets
  }

  // 5. marching squares → wall segments
  const segs: Seg[] = []
  const S = (x: number, y: number): number => solid[idx(x, y)]
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const code = S(x, y) * 8 + S(x + 1, y) * 4 + S(x + 1, y + 1) * 2 + S(x, y + 1) * 1
      if (code === 0 || code === 15) continue
      const top = { x: (x + 0.5) * CELL, y: y * CELL }
      const right = { x: (x + 1) * CELL, y: (y + 0.5) * CELL }
      const bottom = { x: (x + 0.5) * CELL, y: (y + 1) * CELL }
      const left = { x: x * CELL, y: (y + 0.5) * CELL }
      const add = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
      }
      switch (code) {
        case 1: add(left, bottom); break
        case 2: add(bottom, right); break
        case 3: add(left, right); break
        case 4: add(top, right); break
        case 5: add(top, right); add(left, bottom); break
        case 6: add(top, bottom); break
        case 7: add(left, top); break
        case 8: add(left, top); break
        case 9: add(top, bottom); break
        case 10: add(left, top); add(bottom, right); break
        case 11: add(top, right); break
        case 12: add(left, right); break
        case 13: add(right, bottom); break
        case 14: add(bottom, left); break
      }
    }
  }

  const wpx = gw * CELL
  const hpx = gh * CELL

  // 6. spatial hash for segments
  const segCols = Math.ceil(wpx / SEG_HASH_CELL)
  const segRows = Math.ceil(hpx / SEG_HASH_CELL)
  const segBins: number[][] = Array.from({ length: segCols * segRows }, () => [])
  segs.forEach((s, i) => {
    const minX = Math.floor(Math.min(s.ax, s.bx) / SEG_HASH_CELL)
    const maxX = Math.floor(Math.max(s.ax, s.bx) / SEG_HASH_CELL)
    const minY = Math.floor(Math.min(s.ay, s.by) / SEG_HASH_CELL)
    const maxY = Math.floor(Math.max(s.ay, s.by) / SEG_HASH_CELL)
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (cx >= 0 && cy >= 0 && cx < segCols && cy < segRows) {
          segBins[cx + cy * segCols].push(i)
        }
      }
    }
  })

  // 7. echo dots along walls
  const dots: EchoDot[] = []
  for (const s of segs) {
    const dx = s.bx - s.ax, dy = s.by - s.ay
    const len = Math.hypot(dx, dy)
    const tang = Math.atan2(dy, dx)
    const n = Math.max(1, Math.floor(len / ECHO.dotSpacing))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const jx = rng.range(-1.4, 1.4)
      dots.push({
        x: s.ax + dx * t + (-dy / (len || 1)) * jx,
        y: s.ay + dy * t + (dx / (len || 1)) * jx,
        tang,
        lit: -1,
        glow: 0
      })
    }
  }
  const dotCols = Math.ceil(wpx / DOT_HASH_CELL)
  const dotRows = Math.ceil(hpx / DOT_HASH_CELL)
  const dotBins: number[][] = Array.from({ length: dotCols * dotRows }, () => [])
  dots.forEach((d, i) => {
    const cx = clamp(Math.floor(d.x / DOT_HASH_CELL), 0, dotCols - 1)
    const cy = clamp(Math.floor(d.y / DOT_HASH_CELL), 0, dotRows - 1)
    dotBins[cx + cy * dotCols].push(i)
  })

  // 8. spawn / hatch at the two most distant chambers
  let spawn = chambers[0], hatch = chambers[0], best = -1
  for (const a of chambers) {
    for (const b of chambers) {
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
      if (d > best) { best = d; spawn = a; hatch = b }
    }
  }

  return {
    wpx, hpx, gw, gh, solid, segs, segBins, segCols, segRows,
    dots, dotBins, dotCols, dotRows,
    spawnX: (spawn.x + 0.5) * CELL,
    spawnY: (spawn.y + 0.5) * CELL,
    hatchX: (hatch.x + 0.5) * CELL,
    hatchY: (hatch.y + 0.5) * CELL,
    hatchSeenT: -999,
    chambers: chambers.map((c) => ({ x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL }))
  }
}

// ---------------------------------------------------------------------------
// Spatial queries
// ---------------------------------------------------------------------------

export function isSolidAt(world: World, px: number, py: number): boolean {
  const x = Math.floor(px / CELL), y = Math.floor(py / CELL)
  if (x < 0 || y < 0 || x >= world.gw || y >= world.gh) return true
  return world.solid[x + y * world.gw] === 1
}

/** Open cell with fully open 8-neighborhood - safe spot for entities. */
export function isRoomyAt(world: World, px: number, py: number): boolean {
  const x = Math.floor(px / CELL), y = Math.floor(py / CELL)
  if (x < 1 || y < 1 || x >= world.gw - 1 || y >= world.gh - 1) return false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (world.solid[x + dx + (y + dy) * world.gw]) return false
    }
  }
  return true
}

let stampCounter = 1
let segStamp = new Int32Array(0)

/**
 * Nearest wall hit along ray (x1,y1)→(x2,y2). Returns t in [0,1], or Infinity.
 * Walks the segment hash with a grid DDA so long rays stay cheap.
 */
export function raycastT(world: World, x1: number, y1: number, x2: number, y2: number): number {
  if (segStamp.length < world.segs.length) segStamp = new Int32Array(world.segs.length)
  const stamp = stampCounter++
  const cs = SEG_HASH_CELL
  let cx = Math.floor(x1 / cs), cy = Math.floor(y1 / cs)
  const ex = Math.floor(x2 / cs), ey = Math.floor(y2 / cs)
  const dx = x2 - x1, dy = y2 - y1
  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  let tMaxX = dx !== 0 ? (((dx > 0 ? cx + 1 : cx) * cs) - x1) / dx : Infinity
  let tMaxY = dy !== 0 ? (((dy > 0 ? cy + 1 : cy) * cs) - y1) / dy : Infinity
  const tDeltaX = dx !== 0 ? Math.abs(cs / dx) : Infinity
  const tDeltaY = dy !== 0 ? Math.abs(cs / dy) : Infinity

  let bestT = Infinity
  for (let iter = 0; iter < 200; iter++) {
    if (cx >= 0 && cy >= 0 && cx < world.segCols && cy < world.segRows) {
      const bin = world.segBins[cx + cy * world.segCols]
      for (const si of bin) {
        if (segStamp[si] === stamp) continue
        segStamp[si] = stamp
        const s = world.segs[si]
        const t = raySegIntersect(x1, y1, x2, y2, s.ax, s.ay, s.bx, s.by)
        if (t >= 0 && t < bestT) bestT = t
      }
    }
    // stop once the current cell is past the best hit
    const cellEntryT = Math.min(tMaxX, tMaxY)
    if (bestT <= cellEntryT) break
    if (cx === ex && cy === ey) break
    if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX } else { cy += stepY; tMaxY += tDeltaY }
  }
  return bestT
}

/** Is the straight path between two points blocked by walls? */
export function occludedPath(world: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 6) return false
  // shorten so a target sitting ON a wall doesn't occlude itself
  const k = (len - 5) / len
  return raycastT(world, x1, y1, x1 + dx * k, y1 + dy * k) <= 1
}

const cpTmp = { x: 0, y: 0 }

export interface CollideResult {
  x: number
  y: number
  hit: boolean
  nx: number
  ny: number
}

/** Push a circle out of walls. Returns corrected position + average push normal. */
export function collideCircle(world: World, x: number, y: number, r: number): CollideResult {
  const res: CollideResult = { x, y, hit: false, nx: 0, ny: 0 }
  const cs = SEG_HASH_CELL
  for (let pass = 0; pass < 2; pass++) {
    const minX = Math.max(0, Math.floor((res.x - r - 4) / cs))
    const maxX = Math.min(world.segCols - 1, Math.floor((res.x + r + 4) / cs))
    const minY = Math.max(0, Math.floor((res.y - r - 4) / cs))
    const maxY = Math.min(world.segRows - 1, Math.floor((res.y + r + 4) / cs))
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        for (const si of world.segBins[cx + cy * world.segCols]) {
          const s = world.segs[si]
          const d2 = closestPointOnSeg(res.x, res.y, s.ax, s.ay, s.bx, s.by, cpTmp)
          if (d2 < r * r) {
            const d = Math.sqrt(d2)
            let px: number, py: number
            if (d > 0.001) {
              px = (res.x - cpTmp.x) / d
              py = (res.y - cpTmp.y) / d
            } else {
              // dead center on the wall: push along segment normal
              const sdx = s.bx - s.ax, sdy = s.by - s.ay
              const sl = Math.hypot(sdx, sdy) || 1
              px = -sdy / sl
              py = sdx / sl
            }
            const push = r - d + 0.15
            res.x += px * push
            res.y += py * push
            res.nx += px
            res.ny += py
            res.hit = true
          }
        }
      }
    }
    if (!res.hit) break
  }
  const nl = Math.hypot(res.nx, res.ny)
  if (nl > 0) { res.nx /= nl; res.ny /= nl }
  return res
}

/** Random roomy point satisfying min-distance constraints; null if none found. */
export function randomOpenPoint(
  rng: RNG, world: World,
  constraints: { x: number; y: number; d: number }[],
  tries = 400
): { x: number; y: number } | null {
  for (let i = 0; i < tries; i++) {
    const px = rng.range(CELL * 4, world.wpx - CELL * 4)
    const py = rng.range(CELL * 4, world.hpx - CELL * 4)
    if (!isRoomyAt(world, px, py)) continue
    let ok = true
    for (const c of constraints) {
      if ((px - c.x) ** 2 + (py - c.y) ** 2 < c.d * c.d) { ok = false; break }
    }
    if (ok) return { x: px, y: py }
  }
  return null
}
