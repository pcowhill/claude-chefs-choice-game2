// Keyboard + mouse state. Mouse coordinates are in canvas (1920×1080) space.

export class Input {
  down = new Set<string>()
  pressed = new Set<string>()
  mouseX = 960
  mouseY = 540
  lmb = false
  rmb = false
  lmbPressed = false
  rmbPressed = false
  clicked = false        // any mouse button pressed this frame
  anyKeyPressed = false

  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    window.addEventListener('keydown', (e) => {
      // Keep browser shortcuts working, but stop the page from scrolling/zooming on game keys.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault()
      }
      if (!e.repeat) {
        this.down.add(e.code)
        this.pressed.add(e.code)
        this.anyKeyPressed = true
      }
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())

    window.addEventListener('mousemove', (e) => this.updateMouse(e))
    window.addEventListener('mousedown', (e) => {
      this.updateMouse(e)
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true }
      if (e.button === 2) { this.rmb = true; this.rmbPressed = true }
      this.clicked = true
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false
      if (e.button === 2) this.rmb = false
    })
    window.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private updateMouse(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect()
    this.mouseX = ((e.clientX - r.left) / r.width) * this.canvas.width
    this.mouseY = ((e.clientY - r.top) / r.height) * this.canvas.height
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code)
  }

  isDown(code: string): boolean {
    return this.down.has(code)
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear()
    this.lmbPressed = false
    this.rmbPressed = false
    this.clicked = false
    this.anyKeyPressed = false
  }
}
