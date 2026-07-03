import { VIEW_W, VIEW_H } from '../config'

export interface Gfx {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/** Fixed 1920×1080 backbuffer, CSS-scaled to fit the window with letterboxing. */
export function setupCanvas(): Gfx {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const ctx = canvas.getContext('2d', { alpha: false })!

  const fit = (): void => {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)
    canvas.style.width = `${Math.floor(VIEW_W * scale)}px`
    canvas.style.height = `${Math.floor(VIEW_H * scale)}px`
  }
  window.addEventListener('resize', fit)
  fit()

  return { canvas, ctx }
}

export async function loadFont(): Promise<void> {
  try {
    const face = new FontFace('VT323', 'url(fonts/VT323-Regular.ttf)')
    const loaded = await Promise.race([
      face.load(),
      new Promise<null>((res) => setTimeout(() => res(null), 2500))
    ])
    if (loaded) document.fonts.add(loaded)
  } catch {
    // fall back to monospace - the game stays playable
  }
}

export function font(size: number): string {
  return `${size}px "VT323", "Courier New", monospace`
}

const glowCache = new Map<string, HTMLCanvasElement>()

/** Pre-rendered radial glow sprite; drawn with 'lighter' this is our cheap bloom. */
export function glowSprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}|${r}`
  let c = glowCache.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = r * 2
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, color)
  grad.addColorStop(0.35, colorWithAlpha(color, 0.42))
  grad.addColorStop(1, colorWithAlpha(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, r * 2, r * 2)
  glowCache.set(key, c)
  return c
}

function colorWithAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${a})`
}

export function drawGlow(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number, y: number, scale: number, alpha: number
): void {
  if (alpha <= 0.004) return
  const s = sprite.width * scale
  ctx.globalAlpha = alpha
  ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s)
  ctx.globalAlpha = 1
}

export type Align = 'left' | 'center' | 'right'

const glowTextCache = new Map<string, HTMLCanvasElement>()

/** Pre-rendered glowing text sprite — shadowBlur is far too slow to run per frame. */
export function glowTextSprite(text: string, size: number, color: string, blur: number): HTMLCanvasElement {
  const key = `${text}|${size}|${color}|${blur}`
  let c = glowTextCache.get(key)
  if (c) return c
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font(size)
  const w = Math.ceil(probe.measureText(text).width)
  const pad = Math.ceil(blur * 1.6) + 6
  c = document.createElement('canvas')
  c.width = w + pad * 2
  c.height = Math.ceil(size * 1.4) + pad * 2
  const g = c.getContext('2d')!
  g.font = font(size)
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.shadowColor = color
  g.shadowBlur = blur
  g.fillStyle = color
  g.fillText(text, pad, c.height / 2)
  g.shadowBlur = 0
  g.fillText(text, pad, c.height / 2)
  glowTextCache.set(key, c)
  return c
}

/** Draw cached glowing text. Baseline-middle, like drawText. */
export function drawGlowText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, size: number, color: string,
  align: Align = 'left', alpha = 1, blur = 12
): void {
  if (alpha <= 0.004) return
  const s = glowTextSprite(text, size, color, blur)
  const pad = Math.ceil(blur * 1.6) + 6
  let dx = x - pad
  if (align === 'center') dx = x - s.width / 2
  else if (align === 'right') dx = x - s.width + pad
  ctx.globalAlpha = alpha
  ctx.drawImage(s, dx, y - s.height / 2)
  ctx.globalAlpha = 1
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, size: number, color: string,
  align: Align = 'left', alpha = 1, glow = 0
): void {
  ctx.save()
  ctx.font = font(size)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.globalAlpha = alpha
  if (glow > 0) {
    ctx.shadowColor = color
    ctx.shadowBlur = glow
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Military-stencil corner brackets around a rect - our "card" chrome. */
export function drawBrackets(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, len = 18, alpha = 1
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  ctx.lineWidth = 2
  ctx.beginPath()
  // TL
  ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y)
  // TR
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len)
  // BR
  ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h)
  // BL
  ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len)
  ctx.stroke()
  ctx.restore()
}
