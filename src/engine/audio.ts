// Fully synthesized WebAudio SFX. No samples - every sound is built from
// oscillators and filtered noise, routed through a shared "cave echo" bus.

import { clamp } from './math'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private echoBus!: GainNode
  private noiseBuf!: AudioBuffer

  // continuous layers
  private engOsc1!: OscillatorNode
  private engOsc2!: OscillatorNode
  private engGain!: GainNode
  private engFilter!: BiquadFilterNode
  private propGain!: GainNode
  private droneGain!: GainNode
  private dangerGain!: GainNode
  private dangerLfo!: OscillatorNode

  volume = 0.7
  muted = false

  get ready(): boolean { return this.ctx !== null }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx

    this.master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.ratio.value = 5
    this.master.connect(comp)
    comp.connect(ctx.destination)
    this.applyVolume()

    // Shared cave echo: everything that "sends" here rings back off the walls.
    this.echoBus = ctx.createGain()
    const delay = ctx.createDelay(1.0)
    delay.delayTime.value = 0.38
    const fb = ctx.createGain()
    fb.gain.value = 0.34
    const dampen = ctx.createBiquadFilter()
    dampen.type = 'lowpass'
    dampen.frequency.value = 1400
    this.echoBus.connect(delay)
    delay.connect(dampen)
    dampen.connect(fb)
    fb.connect(delay)
    dampen.connect(this.master)

    // 2 seconds of white noise, reused everywhere.
    const len = ctx.sampleRate * 2
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    this.buildEngine()
    this.buildDrone()
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1)
    this.applyVolume()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    this.applyVolume()
    return this.muted
  }

  private applyVolume(): void {
    if (!this.ctx) return
    const v = this.muted ? 0 : this.volume * this.volume
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03)
  }

  /** pan/gain for a sound at distance d (px) and horizontal offset dx from the listener. */
  spatial(dx: number, d: number): { pan: number; gain: number } {
    return { pan: clamp(dx / 720, -0.85, 0.85), gain: clamp(1 / (1 + d / 540), 0.02, 1) }
  }

  // ---- plumbing helpers ------------------------------------------------

  private out(pan: number, echoSend: number): { node: GainNode; when: number } {
    const ctx = this.ctx!
    const g = ctx.createGain()
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p)
    p.connect(this.master)
    if (echoSend > 0) {
      const send = ctx.createGain()
      send.gain.value = echoSend
      p.connect(send)
      send.connect(this.echoBus)
    }
    return { node: g, when: ctx.currentTime }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private tone(
    type: OscillatorType, freq: number, freqEnd: number,
    dur: number, peak: number, pan = 0, echo = 0.15, attack = 0.008
  ): void {
    if (!this.ctx) return
    const { node, when } = this.out(pan, echo)
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, when)
    if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), when + dur)
    this.env(node, when, peak, attack, dur)
    o.connect(node)
    o.start(when)
    o.stop(when + attack + dur + 0.05)
  }

  private noise(
    dur: number, peak: number, pan: number, echo: number,
    filterType: BiquadFilterType, f0: number, f1: number, q = 1, attack = 0.005
  ): void {
    if (!this.ctx) return
    const { node, when } = this.out(pan, echo)
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const filt = this.ctx.createBiquadFilter()
    filt.type = filterType
    filt.frequency.setValueAtTime(f0, when)
    if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), when + dur)
    filt.Q.value = q
    src.connect(filt)
    filt.connect(node)
    this.env(node, when, peak, attack, dur)
    src.start(when)
    src.stop(when + attack + dur + 0.05)
  }

  // ---- one-shots ---------------------------------------------------------

  ping(): void {
    if (!this.ctx) return
    this.tone('sine', 1180, 1120, 1.25, 0.22, 0, 0.5, 0.004)
    this.tone('sine', 1770, 1690, 0.5, 0.06, 0, 0.4, 0.004)
  }

  screechPing(pan: number, gain: number): void {
    if (!this.ctx) return
    const { node, when } = this.out(pan, 0.4)
    const car = this.ctx.createOscillator()
    car.type = 'sine'
    car.frequency.setValueAtTime(760, when)
    car.frequency.exponentialRampToValueAtTime(1560, when + 0.42)
    const mod = this.ctx.createOscillator()
    mod.frequency.value = 37
    const modGain = this.ctx.createGain()
    modGain.gain.value = 210
    mod.connect(modGain)
    modGain.connect(car.frequency)
    this.env(node, when, 0.17 * gain, 0.01, 0.62)
    car.connect(node)
    car.start(when); mod.start(when)
    car.stop(when + 0.75); mod.stop(when + 0.75)
  }

  torpedoLaunch(): void {
    this.noise(0.5, 0.2, 0, 0.2, 'bandpass', 900, 240, 1.6)
    this.tone('triangle', 320, 140, 0.28, 0.1, 0, 0.15)
  }

  explosion(pan: number, gain: number): void {
    this.noise(0.9, 0.5 * gain, pan, 0.55, 'lowpass', 2800, 70, 0.8, 0.004)
    this.tone('sine', 62, 30, 0.7, 0.5 * gain, pan, 0.3, 0.004)
    this.tone('triangle', 190, 40, 0.35, 0.2 * gain, pan, 0.3)
  }

  mineBeep(pan: number, gain: number): void {
    this.tone('square', 1560, 1560, 0.09, 0.12 * gain, pan, 0.1, 0.002)
  }

  thunk(pan: number, gain: number): void {
    this.noise(0.16, 0.22 * gain, pan, 0.3, 'lowpass', 900, 120, 1)
    this.tone('sine', 150, 70, 0.16, 0.16 * gain, pan, 0.25)
  }

  wallBump(gain: number): void {
    this.noise(0.2, 0.2 * gain, 0, 0.25, 'bandpass', 340, 180, 1.2)
    this.tone('sine', 95, 55, 0.22, 0.22 * gain, 0, 0.2)
  }

  hurt(): void {
    this.noise(0.1, 0.4, 0, 0.2, 'highpass', 1400, 900, 1, 0.002)
    this.tone('triangle', 340, 210, 0.14, 0.3, 0, 0.2, 0.002)
    // hull groan
    if (!this.ctx) return
    const { node, when } = this.out(0, 0.3)
    const o = this.ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(88, when)
    o.frequency.linearRampToValueAtTime(56, when + 1.1)
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 200
    o.connect(filt); filt.connect(node)
    this.env(node, when, 0.16, 0.05, 1.15)
    o.start(when); o.stop(when + 1.3)
  }

  pickup(): void {
    this.tone('sine', 620, 620, 0.07, 0.14, 0, 0.1, 0.003)
    setTimeout(() => this.tone('sine', 930, 930, 0.1, 0.14, 0, 0.15, 0.003), 70)
  }

  uiMove(): void { this.tone('sine', 500, 500, 0.045, 0.08, 0, 0.05, 0.002) }
  uiSelect(): void {
    this.tone('sine', 660, 660, 0.06, 0.12, 0, 0.1, 0.002)
    setTimeout(() => this.tone('sine', 990, 990, 0.1, 0.12, 0, 0.12, 0.002), 55)
  }
  tickerBlip(): void { this.tone('sine', 1240, 1240, 0.025, 0.05, 0, 0, 0.002) }

  detectedStinger(): void {
    this.tone('square', 840, 840, 0.09, 0.1, 0, 0.15, 0.003)
    setTimeout(() => this.tone('square', 620, 620, 0.14, 0.1, 0, 0.15, 0.003), 90)
  }

  call(kind: string, pan: number, gain: number): void {
    if (!this.ctx) return
    switch (kind) {
      case 'drifter': {
        const { node, when } = this.out(pan, 0.4)
        const o = this.ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(235, when)
        o.frequency.exponentialRampToValueAtTime(150, when + 1.0)
        const vib = this.ctx.createOscillator()
        vib.frequency.value = 5.5
        const vg = this.ctx.createGain()
        vg.gain.value = 9
        vib.connect(vg); vg.connect(o.frequency)
        this.env(node, when, 0.13 * gain, 0.09, 1.0)
        o.connect(node)
        o.start(when); vib.start(when)
        o.stop(when + 1.2); vib.stop(when + 1.2)
        break
      }
      case 'stalker': {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => this.noise(0.09, 0.2 * gain, pan, 0.35, 'bandpass', 320 + i * 60, 210, 5, 0.004), i * 110)
        }
        break
      }
      case 'mauler': {
        const { node, when } = this.out(pan, 0.45)
        const o = this.ctx.createOscillator()
        o.type = 'square'
        o.frequency.setValueAtTime(64, when)
        o.frequency.linearRampToValueAtTime(44, when + 0.85)
        const filt = this.ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.value = 290
        const shaper = this.ctx.createWaveShaper()
        shaper.curve = this.distCurve(24)
        o.connect(shaper); shaper.connect(filt); filt.connect(node)
        this.env(node, when, 0.3 * gain, 0.05, 0.9)
        o.start(when); o.stop(when + 1.05)
        break
      }
      case 'windup': {
        const { node, when } = this.out(pan, 0.4)
        const o = this.ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(50, when)
        o.frequency.exponentialRampToValueAtTime(130, when + 0.65)
        const filt = this.ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.value = 380
        o.connect(filt); filt.connect(node)
        this.env(node, when, 0.26 * gain, 0.04, 0.7)
        o.start(when); o.stop(when + 0.8)
        break
      }
      case 'leviathan': {
        const { node, when } = this.out(pan * 0.5, 0.6)
        for (const f of [55, 55.8, 110.6, 82.5]) {
          const o = this.ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.setValueAtTime(f, when)
          o.frequency.linearRampToValueAtTime(f * 0.82, when + 2.0)
          const og = this.ctx.createGain()
          og.gain.value = 0.3
          o.connect(og); og.connect(node)
          o.start(when); o.stop(when + 2.3)
        }
        const filt = this.ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.setValueAtTime(420, when)
        filt.frequency.linearRampToValueAtTime(160, when + 2.0)
        // re-route: node currently → master; insert filter
        node.disconnect()
        node.connect(filt)
        const p = this.ctx.createStereoPanner()
        p.pan.value = pan * 0.5
        filt.connect(p); p.connect(this.master)
        const send = this.ctx.createGain()
        send.gain.value = 0.6
        p.connect(send); send.connect(this.echoBus)
        this.env(node, when, 0.5 * gain, 0.12, 2.1)
        this.tone('sine', 34, 30, 1.8, 0.4 * gain, 0, 0.2, 0.1)
        break
      }
      default: {
        this.tone('sine', 200, 150, 0.5, 0.1 * gain, pan, 0.3)
      }
    }
  }

  /** Soft water-displacement swish - a creature moving nearby. */
  swish(pan: number, gain: number): void {
    this.noise(0.35, 0.09 * gain, pan, 0.15, 'bandpass', 260, 170, 1.4, 0.06)
  }

  ventPuff(pan: number, gain: number): void {
    this.noise(0.8, 0.07 * gain, pan, 0.2, 'lowpass', 620, 140, 0.8, 0.18)
  }

  decoyChirp(pan: number, gain: number): void {
    this.tone('square', 1040, 940, 0.11, 0.1 * gain, pan, 0.35, 0.003)
  }

  creatureDeath(pan: number, gain: number): void {
    this.tone('triangle', 320, 52, 0.5, 0.22 * gain, pan, 0.3)
    this.noise(0.4, 0.18 * gain, pan, 0.35, 'lowpass', 1600, 100, 1)
  }

  descend(): void {
    this.noise(2.2, 0.22, 0, 0.4, 'lowpass', 800, 60, 0.8, 0.3)
    this.tone('sine', 70, 38, 2.0, 0.2, 0, 0.3, 0.3)
  }

  upgradeStinger(): void {
    const seq = [392, 523, 659]
    seq.forEach((f, i) => setTimeout(() => this.tone('triangle', f, f, 0.16, 0.13, 0, 0.2, 0.004), i * 95))
  }

  winSwell(): void {
    const seq = [262, 330, 392, 523, 659, 784]
    seq.forEach((f, i) => setTimeout(() => this.tone('sine', f, f, 0.9, 0.12, 0, 0.35, 0.05), i * 160))
  }

  deathToll(): void {
    this.tone('sine', 220, 55, 2.4, 0.3, 0, 0.5, 0.01)
    this.noise(1.8, 0.2, 0, 0.5, 'lowpass', 500, 50, 1, 0.05)
  }

  private distCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 256
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
    }
    return curve
  }

  // ---- continuous layers -------------------------------------------------

  private buildEngine(): void {
    const ctx = this.ctx!
    this.engGain = ctx.createGain()
    this.engGain.gain.value = 0
    this.engFilter = ctx.createBiquadFilter()
    this.engFilter.type = 'lowpass'
    this.engFilter.frequency.value = 220

    this.engOsc1 = ctx.createOscillator()
    this.engOsc1.type = 'triangle'
    this.engOsc1.frequency.value = 55
    this.engOsc2 = ctx.createOscillator()
    this.engOsc2.type = 'sawtooth'
    this.engOsc2.frequency.value = 82.8
    const o2g = ctx.createGain()
    o2g.gain.value = 0.4
    this.engOsc1.connect(this.engFilter)
    this.engOsc2.connect(o2g)
    o2g.connect(this.engFilter)
    this.engFilter.connect(this.engGain)
    this.engGain.connect(this.master)
    this.engOsc1.start()
    this.engOsc2.start()

    // prop wash
    const prop = ctx.createBufferSource()
    prop.buffer = this.noiseBuf
    prop.loop = true
    const pf = ctx.createBiquadFilter()
    pf.type = 'bandpass'
    pf.frequency.value = 420
    pf.Q.value = 0.7
    this.propGain = ctx.createGain()
    this.propGain.gain.value = 0
    prop.connect(pf)
    pf.connect(this.propGain)
    this.propGain.connect(this.master)
    prop.start()
  }

  /** throttle 0..1, flank boolean. Call every frame during gameplay. */
  setEngine(throttle: number, flank: boolean): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const base = flank ? 1.4 : 1
    this.engOsc1.frequency.setTargetAtTime(55 * (1 + throttle * 0.5) * base, t, 0.12)
    this.engOsc2.frequency.setTargetAtTime(82.8 * (1 + throttle * 0.5) * base, t, 0.12)
    this.engFilter.frequency.setTargetAtTime(180 + throttle * 320 * base, t, 0.12)
    this.engGain.gain.setTargetAtTime(throttle * (flank ? 0.16 : 0.09), t, 0.1)
    this.propGain.gain.setTargetAtTime(throttle * throttle * (flank ? 0.1 : 0.05), t, 0.1)
  }

  private buildDrone(): void {
    const ctx = this.ctx!
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0
    const n = ctx.createBufferSource()
    n.buffer = this.noiseBuf
    n.loop = true
    const nf = ctx.createBiquadFilter()
    nf.type = 'lowpass'
    nf.frequency.value = 110
    n.connect(nf)
    nf.connect(this.droneGain)
    for (const f of [48.2, 49.1]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.value = 0.4
      o.connect(og)
      og.connect(this.droneGain)
      o.start()
    }
    this.droneGain.connect(this.master)
    n.start()

    // danger layer: tremolo'd mid-low tone that swells when hunted
    this.dangerGain = ctx.createGain()
    this.dangerGain.gain.value = 0
    const d = ctx.createOscillator()
    d.type = 'triangle'
    d.frequency.value = 66
    const trem = ctx.createGain()
    this.dangerLfo = ctx.createOscillator()
    this.dangerLfo.frequency.value = 4.5
    const lfoG = ctx.createGain()
    lfoG.gain.value = 0.5
    this.dangerLfo.connect(lfoG)
    lfoG.connect(trem.gain)
    trem.gain.value = 0.5
    d.connect(trem)
    trem.connect(this.dangerGain)
    this.dangerGain.connect(this.master)
    d.start()
    this.dangerLfo.start()
  }

  setDrone(on: boolean): void {
    if (!this.ctx) return
    this.droneGain.gain.setTargetAtTime(on ? 0.055 : 0, this.ctx.currentTime, 0.8)
  }

  setDanger(d: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.dangerGain.gain.setTargetAtTime(d * 0.075, t, 0.4)
    this.dangerLfo.frequency.setTargetAtTime(3.5 + d * 4.5, t, 0.4)
  }
}
