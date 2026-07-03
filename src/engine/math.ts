// Small math + seeded RNG utilities.

export const TAU = Math.PI * 2

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  return Math.sqrt(dx * dx + dy * dy)
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  return dx * dx + dy * dy
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax)
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angDiff(from: number, to: number): number {
  let d = (to - from) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/** Rotate `from` toward `to` by at most `step` radians. */
export function turnToward(from: number, to: number, step: number): number {
  const d = angDiff(from, to)
  if (Math.abs(d) <= step) return to
  return from + Math.sign(d) * step
}

/** Closest point on segment AB to point P; writes into out, returns distance². */
export function closestPointOnSeg(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
  out: { x: number; y: number }
): number {
  const abx = bx - ax, aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0
  t = clamp(t, 0, 1)
  out.x = ax + abx * t
  out.y = ay + aby * t
  const dx = px - out.x, dy = py - out.y
  return dx * dx + dy * dy
}

/**
 * Ray/segment intersection. Returns t along the ray in [0,1] or -1.
 * Ray: (x1,y1)->(x2,y2). Segment: (x3,y3)->(x4,y4).
 */
export function raySegIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): number {
  const rdx = x2 - x1, rdy = y2 - y1
  const sdx = x4 - x3, sdy = y4 - y3
  const denom = rdx * sdy - rdy * sdx
  if (Math.abs(denom) < 1e-9) return -1
  const t = ((x3 - x1) * sdy - (y3 - y1) * sdx) / denom
  const u = ((x3 - x1) * rdy - (y3 - y1) * rdx) / denom
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t
  return -1
}

/** Deterministic RNG (mulberry32). */
export class RNG {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1))
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  angle(): number {
    return this.next() * TAU
  }
}
