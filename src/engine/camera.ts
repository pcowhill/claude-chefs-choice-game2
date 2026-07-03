import { VIEW_W, VIEW_H } from '../config'
import { clamp, lerp } from './math'

export class Camera {
  x = 0
  y = 0
  private trauma = 0
  private shakeX = 0
  private shakeY = 0
  private t = 0

  snapTo(x: number, y: number): void {
    this.x = x
    this.y = y
  }

  update(dt: number, targetX: number, targetY: number, leadX: number, leadY: number, worldW: number, worldH: number): void {
    this.t += dt
    const tx = targetX + clamp(leadX, -130, 130)
    const ty = targetY + clamp(leadY, -90, 90)
    const k = 1 - Math.exp(-5.2 * dt)
    this.x = lerp(this.x, tx, k)
    this.y = lerp(this.y, ty, k)
    // Keep the view inside the world (worlds are always bigger than the view).
    this.x = clamp(this.x, VIEW_W / 2 - 60, worldW - VIEW_W / 2 + 60)
    this.y = clamp(this.y, VIEW_H / 2 - 60, worldH - VIEW_H / 2 + 60)

    this.trauma = Math.max(0, this.trauma - dt * 1.7)
    const s = this.trauma * this.trauma * 26
    this.shakeX = (Math.sin(this.t * 87.3) + Math.sin(this.t * 41.1)) * 0.5 * s
    this.shakeY = (Math.cos(this.t * 77.7) + Math.sin(this.t * 53.9)) * 0.5 * s
  }

  addShake(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1)
  }

  /** Top-left corner of the view in world space (includes shake). */
  get left(): number { return this.x - VIEW_W / 2 + this.shakeX }
  get top(): number { return this.y - VIEW_H / 2 + this.shakeY }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(-this.left, -this.top)
  }

  toWorldX(sx: number): number { return sx + this.left }
  toWorldY(sy: number): number { return sy + this.top }
  toScreenX(wx: number): number { return wx - this.left }
  toScreenY(wy: number): number { return wy - this.top }

  onScreen(wx: number, wy: number, margin = 60): boolean {
    return wx > this.left - margin && wx < this.left + VIEW_W + margin &&
           wy > this.top - margin && wy < this.top + VIEW_H + margin
  }
}
