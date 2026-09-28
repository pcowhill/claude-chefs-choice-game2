// App state machine + all non-gameplay screens, drawn in-canvas so the whole
// game shares one phosphor look.

import { VIEW_W, VIEW_H, COLORS, ZONES, VERSION, type UpgradeDef } from '../config'
import { clamp, TAU } from '../engine/math'
import { drawText, drawGlowText, drawBrackets, font } from '../engine/gfx'
import type { Run, IO } from './types'
import {
  newRun, startZone, updatePlaying, zoneClearBonus, finalizeScore,
  rankFor, rollUpgradeChoices, applyUpgrade, type ScoreBreakdown
} from './run'
import { drawWorld } from './render'
import { drawHud, drawControlsCard } from './hud'

export type AppState = 'title' | 'briefing' | 'playing' | 'paused' | 'upgrade' | 'dead' | 'won'

export interface SaveData {
  best: number
  bestDepth: number
  runs: number
  wins: number
  volume: number
  muted: boolean
}

const SAVE_KEY = 'earshot.save.v1'

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { best: 0, bestDepth: 0, runs: 0, wins: 0, volume: 0.7, muted: false, ...JSON.parse(raw) }
  } catch { /* fresh save */ }
  return { best: 0, bestDepth: 0, runs: 0, wins: 0, volume: 0.7, muted: false }
}

export function persistSave(s: SaveData): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}

interface TitleDot { x: number; y: number; a: number; lit: number }

export interface App {
  state: AppState
  stateT: number
  run: Run | null
  io: IO
  save: SaveData
  choices: UpgradeDef[]
  hoverIdx: number
  menuIdx: number
  pendingZone: number
  breakdown: ScoreBreakdown | null
  newBest: boolean
  titleDots: TitleDot[]
  titleRingR: number
  briefBlip: number
}

export function createApp(io: IO): App {
  const save = loadSave()
  io.audio.volume = save.volume
  io.audio.muted = save.muted
  return {
    state: 'title',
    stateT: 0,
    run: null,
    io,
    save,
    choices: [],
    hoverIdx: 0,
    menuIdx: 0,
    pendingZone: 0,
    breakdown: null,
    newBest: false,
    titleDots: makeTitleDots(),
    titleRingR: 0,
    briefBlip: 0
  }
}

function makeTitleDots(): TitleDot[] {
  const dots: TitleDot[] = []
  // rough cave silhouette hugging the screen edges
  const rand = (a: number, b: number): number => a + Math.random() * (b - a)
  for (let i = 0; i < 900; i++) {
    const a = rand(0, TAU)
    const wob = Math.sin(a * 3.1) * 90 + Math.sin(a * 7.3 + 1.7) * 55 + Math.sin(a * 13.7) * 30
    const r = 620 + wob + rand(-10, 10)
    const x = VIEW_W / 2 + Math.cos(a) * r * 1.35
    const y = VIEW_H / 2 + Math.sin(a) * r * 0.82
    if (x < -40 || x > VIEW_W + 40 || y < -40 || y > VIEW_H + 40) continue
    dots.push({ x, y, a, lit: -99 })
  }
  return dots
}

function enter(app: App, state: AppState): void {
  app.state = state
  app.stateT = 0
  app.menuIdx = 0
  app.hoverIdx = -1
  const audio = app.io.audio
  if (audio.ready) {
    audio.setDrone(state === 'playing' || state === 'paused')
    if (state !== 'playing') {
      audio.setEngine(0, false)
      audio.setDanger(0)
    }
  }
}

// ============================================================================
// update
// ============================================================================

export function updateApp(app: App, dt: number): void {
  app.stateT += dt
  const { input, audio } = app.io

  if (input.wasPressed('KeyM')) {
    audio.init()
    app.save.muted = audio.toggleMute()
    persistSave(app.save)
  }

  switch (app.state) {
    case 'title': {
      app.titleRingR += dt * 460
      const maxR = 1500
      if (app.titleRingR > maxR) app.titleRingR = -200
      for (const d of app.titleDots) {
        const r = Math.hypot((d.x - VIEW_W / 2) / 1.35, (d.y - VIEW_H / 2) / 0.82)
        if (Math.abs(r - app.titleRingR) < 26) d.lit = app.stateT
      }
      if (input.clicked || input.wasPressed('Enter') || input.wasPressed('Space')) {
        audio.init()
        audio.uiSelect()
        app.run = newRun()
        enter(app, 'briefing')
      }
      break
    }

    case 'briefing': {
      const chars = Math.floor(app.stateT * 55)
      if (chars > app.briefBlip + 3 && chars < 400) {
        app.briefBlip = chars
        if (audio.ready) audio.tickerBlip()
      }
      if (app.stateT > 0.55 && (input.clicked || input.wasPressed('Space') || input.wasPressed('Enter'))) {
        audio.uiSelect()
        app.briefBlip = 0
        enter(app, 'playing')
      }
      break
    }

    case 'playing': {
      const run = app.run!
      if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
        audio.uiMove()
        enter(app, 'paused')
        break
      }
      updatePlaying(run, app.io, dt)
      if (run.outcome === 'descend') {
        run.outcome = 'playing'
        zoneClearBonus(run)
        audio.descend()
        app.pendingZone = run.zoneIdx + 1
        app.save.bestDepth = Math.max(app.save.bestDepth, ZONES[app.pendingZone].depth)
        persistSave(app.save)
        app.choices = rollUpgradeChoices(run)
        enter(app, 'upgrade')
      } else if (run.outcome === 'dead') {
        run.outcome = 'playing'
        app.breakdown = finalizeScore(run, false)
        app.save.runs++
        app.newBest = run.score > app.save.best
        if (app.newBest) app.save.best = run.score
        persistSave(app.save)
        enter(app, 'dead')
      } else if (run.outcome === 'won') {
        run.outcome = 'playing'
        app.breakdown = finalizeScore(run, true)
        app.save.runs++
        app.save.wins++
        app.save.bestDepth = Math.max(app.save.bestDepth, 2100)
        app.newBest = run.score > app.save.best
        if (app.newBest) app.save.best = run.score
        persistSave(app.save)
        audio.winSwell()
        enter(app, 'won')
      }
      break
    }

    case 'paused': {
      if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
        audio.uiSelect()
        enter(app, 'playing')
        break
      }
      const items = 5
      const my = input.mouseY
      const menuTop = 380
      const hovered = Math.floor((my - menuTop + 28) / 62)
      if (input.mouseX > VIEW_W / 2 - 420 && input.mouseX < VIEW_W / 2 + 60 && hovered >= 0 && hovered < items) {
        if (hovered !== app.menuIdx) {
          app.menuIdx = hovered
        }
      }
      if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
        app.menuIdx = (app.menuIdx + 1) % items
        audio.uiMove()
      }
      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
        app.menuIdx = (app.menuIdx + items - 1) % items
        audio.uiMove()
      }
      if (app.menuIdx === 2) {
        let dv = 0
        if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) dv = -0.1
        if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) dv = 0.1
        if (dv !== 0) {
          audio.init()
          audio.setVolume(clamp(audio.volume + dv, 0, 1))
          app.save.volume = audio.volume
          persistSave(app.save)
          audio.uiMove()
        }
      }
      const activate = input.wasPressed('Enter') || input.clicked
      if (activate) {
        audio.uiSelect()
        switch (app.menuIdx) {
          case 0: enter(app, 'playing'); break
          case 1: app.run = newRun(); enter(app, 'briefing'); break
          case 2: break
          case 3: app.save.muted = audio.toggleMute(); persistSave(app.save); break
          case 4: enter(app, 'title'); break
        }
      }
      if (input.wasPressed('KeyR')) {
        audio.uiSelect()
        app.run = newRun()
        enter(app, 'briefing')
      }
      break
    }

    case 'upgrade': {
      // card hit testing
      const cardW = 430, cardH = 330, gap = 40
      const totalW = cardW * 3 + gap * 2
      const x0 = (VIEW_W - totalW) / 2
      const y0 = 330
      let hover = -1
      for (let i = 0; i < app.choices.length; i++) {
        const x = x0 + i * (cardW + gap)
        if (input.mouseX >= x && input.mouseX <= x + cardW && input.mouseY >= y0 && input.mouseY <= y0 + cardH) {
          hover = i
        }
      }
      if (hover >= 0 && hover !== app.hoverIdx) audio.uiMove()
      app.hoverIdx = hover

      let pick = -1
      if (input.wasPressed('Digit1')) pick = 0
      if (input.wasPressed('Digit2')) pick = 1
      if (input.wasPressed('Digit3')) pick = 2
      if (input.clicked && hover >= 0) pick = hover
      if (pick >= 0 && pick < app.choices.length) {
        const run = app.run!
        applyUpgrade(run, app.choices[pick])
        audio.upgradeStinger()
        startZone(run, app.pendingZone)
        enter(app, 'briefing')
      }
      break
    }

    case 'dead':
    case 'won': {
      if (app.stateT < 0.8) break
      if (input.wasPressed('KeyR') || input.clicked || input.wasPressed('Enter') || input.wasPressed('Space')) {
        app.io.audio.uiSelect()
        app.run = newRun()
        enter(app, 'briefing')
      } else if (input.wasPressed('KeyT')) {
        app.io.audio.uiSelect()
        enter(app, 'title')
      }
      break
    }
  }
}

// ============================================================================
// draw
// ============================================================================

export function drawApp(app: App, ctx: CanvasRenderingContext2D): void {
  switch (app.state) {
    case 'title': drawTitle(app, ctx); break
    case 'briefing': drawBriefing(app, ctx); break
    case 'playing': {
      drawWorld(app.run!, ctx)
      drawHud(app.run!, ctx)
      break
    }
    case 'paused': {
      drawWorld(app.run!, ctx)
      drawHud(app.run!, ctx)
      drawPause(app, ctx)
      break
    }
    case 'upgrade': drawUpgrade(app, ctx); break
    case 'dead': drawEnd(app, ctx, false); break
    case 'won': drawEnd(app, ctx, true); break
  }

  // universal fade-in on state entry
  const fade = 1 - clamp(app.stateT * 2.2, 0, 1)
  if (fade > 0) {
    ctx.fillStyle = `rgba(1,4,3,${fade})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
}

function drawTitle(app: App, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const t = app.stateT

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // expanding survey ring
  if (app.titleRingR > 0) {
    ctx.strokeStyle = COLORS.phos
    ctx.globalAlpha = clamp(1 - app.titleRingR / 1500, 0, 1) * 0.4
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(VIEW_W / 2, VIEW_H / 2, app.titleRingR * 1.35, app.titleRingR * 0.82, 0, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // cave silhouette dots
  ctx.fillStyle = COLORS.phos
  for (const d of app.titleDots) {
    const age = t - d.lit
    if (age > 7 || d.lit < 0) continue
    const a = clamp(1 - age / 7, 0, 1)
    ctx.globalAlpha = a * a * 0.75
    ctx.fillRect(d.x, d.y, 2.2, 2.2)
  }
  ctx.globalAlpha = 1

  // wordmark: pre-rendered glowing letters, flickered on per-letter
  const title = 'EARSHOT'
  ctx.font = font(210)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = VIEW_W / 2
  let x = cx - ctx.measureText(title).width / 2
  for (let i = 0; i < title.length; i++) {
    const ch = title[i]
    const w = ctx.measureText(ch).width
    const on = clamp((t - 0.35 - i * 0.14) * 4, 0, 1)
    const flick = on < 1 ? (Math.sin(t * 47 + i * 9) > -0.4 ? 1 : 0.15) : 1
    const a = on * flick * (0.88 + 0.12 * Math.sin(t * 2.2 + i))
    drawGlowText(ctx, ch, x + w / 2, 305, 210, COLORS.phosBright, 'center', a, 30)
    x += w
  }

  const sub = clamp((t - 1.7) * 2.4, 0, 1)
  drawGlowText(ctx, 'A SONAR HUNT IN THE LIGHTLESS DEEP', cx, 435, 36, COLORS.phos, 'center', sub * 0.95, 10)
  drawText(ctx, 'nothing down here has eyes', cx, 483, 27, COLORS.hud, 'center', sub * 0.7)

  const ui = clamp((t - 2.2) * 2.4, 0, 1)
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.4)
  drawGlowText(ctx, '[ CLICK TO DIVE ]', cx, 620, 44, COLORS.white, 'center', ui * pulse, 14)

  // controls, in miniature
  const rows: [string, string][] = [
    ['WASD', 'helm'], ['SPACE / RMB', 'ping'], ['LMB', 'torpedo'],
    ['E', 'decoy'], ['SHIFT', 'flank'], ['M', 'mute']
  ]
  let rx = cx - 570
  for (const [k, v] of rows) {
    drawText(ctx, k, rx, 730, 26, COLORS.phosBright, 'left', ui * 0.9)
    drawText(ctx, v, rx, 762, 22, COLORS.hud, 'left', ui * 0.65)
    rx += 200
  }

  drawText(ctx, 'every sound you make is light - theirs and yours', cx, 840, 24, COLORS.hud, 'center', ui * 0.55)

  if (app.save.best > 0) {
    drawText(ctx, `BEST SCORE ${app.save.best}`, VIEW_W - 46, 52, 28, COLORS.phos, 'right', ui * 0.8)
    drawText(ctx, `DEEPEST -${app.save.bestDepth}M   RUNS ${app.save.runs}   ASCENTS ${app.save.wins}`,
      VIEW_W - 46, 88, 22, COLORS.hud, 'right', ui * 0.6)
  }
  drawText(ctx, `EARSHOT ${VERSION}`, 46, VIEW_H - 40, 20, COLORS.hudDim, 'left', 0.8)
  drawText(ctx, 'best played with sound on', VIEW_W - 46, VIEW_H - 40, 20, COLORS.hud, 'right', 0.55)

  ctx.restore()
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number): string[] {
  ctx.font = font(size)
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word
    if (ctx.measureText(probe).width > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = probe
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawBriefing(app: App, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const run = app.run!
  const zone = run.zone
  const t = app.stateT
  const cx = VIEW_W / 2

  drawText(ctx, `DIVE LOG - DESCENT ${run.zoneIdx + 1} OF 6`, cx, 200, 30, COLORS.hud, 'center', 0.8)
  drawGlowText(ctx, `-${zone.depth}M`, cx, 300, 96, COLORS.phosBright, 'center', 1, 18)
  drawGlowText(ctx, zone.name, cx, 390, 56, COLORS.phos, 'center', 0.95, 8)

  // typewriter log
  const chars = Math.floor(t * 55)
  const shown = zone.log.slice(0, chars)
  const lines = wrapLines(ctx, shown, 30, 1080)
  let y = 490
  for (const line of lines) {
    drawText(ctx, line, cx, y, 30, COLORS.phos, 'center', 0.85)
    y += 42
  }

  if (chars >= zone.log.length) {
    const obj = run.zoneIdx === 5
      ? 'OBJECTIVE: REACH THE ASCENT STATION ALIVE'
      : `OBJECTIVE: CULL ${zone.quota} CONTACTS, THEN DESCEND`
    drawText(ctx, obj, cx, y + 40, 32, COLORS.amber, 'center', 0.95, 8)

    if (run.upgrades.size > 0) {
      const owned = [...run.upgrades].join(' / ').toUpperCase()
      drawText(ctx, `FITTED: ${owned}`, cx, y + 92, 22, COLORS.hud, 'center', 0.6)
    }
  }

  const pulse = 0.5 + 0.5 * Math.sin(t * 3.6)
  if (t > 0.55) {
    drawText(ctx, '[ SPACE - RELEASE THE CLAMPS ]', cx, 900, 34, COLORS.white, 'center', pulse, 10)
  }
  drawText(ctx, `HULL ${Math.ceil(run.player.hull)}%   TORPEDOES ${run.player.ammo}   DECOYS ${run.player.decoys}   SCORE ${run.score}`,
    cx, 970, 24, COLORS.hud, 'center', 0.7)
}

function drawUpgrade(app: App, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const run = app.run!
  const cx = VIEW_W / 2
  const t = app.stateT

  drawText(ctx, 'ZONE CLEAR', cx, 130, 44, COLORS.phosBright, 'center', 1, 10)
  drawText(ctx, `REFIT BAY - SELECT ONE SYSTEM`, cx, 200, 34, COLORS.phos, 'center', 0.9)
  drawText(ctx, `NEXT: -${ZONES[app.pendingZone].depth}M ${ZONES[app.pendingZone].name}`, cx, 246, 26, COLORS.hud, 'center', 0.7)

  const cardW = 430, cardH = 330, gap = 40
  const totalW = cardW * 3 + gap * 2
  const x0 = (VIEW_W - totalW) / 2
  const y0 = 330

  app.choices.forEach((u, i) => {
    const x = x0 + i * (cardW + gap)
    const hover = app.hoverIdx === i
    const reveal = clamp((t - 0.15 - i * 0.14) * 4, 0, 1)
    ctx.globalAlpha = reveal
    if (hover) {
      ctx.fillStyle = 'rgba(61,214,140,0.07)'
      ctx.fillRect(x, y0, cardW, cardH)
    }
    drawBrackets(ctx, x, y0, cardW, cardH, hover ? COLORS.phosBright : COLORS.hudDim, 22, reveal)
    drawText(ctx, `${i + 1}`, x + 30, y0 + 44, 34, hover ? COLORS.white : COLORS.hud, 'left', reveal * 0.9)
    drawText(ctx, u.name, x + cardW / 2, y0 + 100, 33, hover ? COLORS.phosBright : COLORS.phos, 'center', reveal, hover ? 10 : 0)
    const descLines = wrapLines(ctx, u.desc, 26, cardW - 70)
    let dy = y0 + 160
    for (const line of descLines) {
      drawText(ctx, line, x + cardW / 2, dy, 26, COLORS.phos, 'center', reveal * 0.85)
      dy += 34
    }
    const flavLines = wrapLines(ctx, `"${u.flavor}"`, 22, cardW - 80)
    let fy = y0 + cardH - 34 - (flavLines.length - 1) * 28
    for (const line of flavLines) {
      drawText(ctx, line, x + cardW / 2, fy, 22, COLORS.hud, 'center', reveal * 0.6)
      fy += 28
    }
    ctx.globalAlpha = 1
  })

  const pulse = 0.5 + 0.5 * Math.sin(t * 3.4)
  drawText(ctx, 'CLICK A SYSTEM  or  PRESS 1 / 2 / 3', cx, 760, 28, COLORS.white, 'center', pulse * 0.9)
  drawText(ctx, `HULL ${Math.ceil(run.player.hull)}%   SCORE ${run.score}`, cx, 830, 24, COLORS.hud, 'center', 0.7)
}

function drawPause(app: App, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(1,5,4,0.85)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  const cx = VIEW_W / 2
  const audio = app.io.audio

  drawText(ctx, 'HOLDING STATION', cx, 220, 64, COLORS.phosBright, 'center', 1, 12)
  drawText(ctx, 'the deep waits', cx, 280, 26, COLORS.hud, 'center', 0.6)

  const volBar = '#'.repeat(Math.round(audio.volume * 10)).padEnd(10, '-')
  const items = [
    'RESUME',
    'RESTART DIVE',
    `SOUND  < ${volBar} >`,
    `MUTE: ${audio.muted ? 'ON' : 'OFF'}`,
    'ABANDON TO TITLE'
  ]
  const menuTop = 380
  items.forEach((it, i) => {
    const sel = app.menuIdx === i
    const y = menuTop + i * 62
    drawText(ctx, sel ? `> ${it} <` : it, cx - 180, y, 34, sel ? COLORS.white : COLORS.phos, 'center', sel ? 1 : 0.7, sel ? 8 : 0)
  })

  drawControlsCard(ctx, cx + 220, menuTop, 0.9)

  const run = app.run!
  drawText(ctx, `DEPTH -${run.zone.depth}M   SEED ${run.seed.toString(16).toUpperCase()}`, cx, VIEW_H - 80, 20, COLORS.hudDim, 'center', 0.8)
}

function drawEnd(app: App, ctx: CanvasRenderingContext2D, won: boolean): void {
  const run = app.run!
  const t = app.stateT
  const cx = VIEW_W / 2

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  // slow rings radiating - triumphant or funereal
  const ringCol = won ? COLORS.phos : COLORS.redDim
  for (let i = 0; i < 3; i++) {
    const r = ((t * (won ? 130 : 60) + i * 320) % 960)
    ctx.strokeStyle = ringCol
    ctx.globalAlpha = clamp(1 - r / 960, 0, 1) * 0.28
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, 330, r * 1.3, r * 0.8, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  if (won) {
    drawGlowText(ctx, 'DAYLIGHT.', cx, 250, 150, COLORS.white, 'center', clamp(t * 1.4, 0, 1), 30)
    drawText(ctx, 'you came back up. most don\'t.', cx, 360, 30, COLORS.phos, 'center', clamp((t - 0.6) * 2, 0, 1) * 0.85)
  } else {
    const flick = Math.sin(t * 31) > -0.6 ? 1 : 0.4
    drawGlowText(ctx, 'HULL LOST', cx, 250, 150, COLORS.red, 'center', clamp(t * 1.4, 0, 1) * flick, 26)
    drawText(ctx, `at -${run.zone.depth}m - ${run.zone.name.toLowerCase()}`, cx, 360, 30, COLORS.amber, 'center', clamp((t - 0.6) * 2, 0, 1) * 0.85)
  }

  const a2 = clamp((t - 1.0) * 2, 0, 1)
  const s = run.stats
  const acc = s.torpsFired > 0 ? Math.round((s.torpsHit / s.torpsFired) * 100) : 0
  const mins = Math.floor(s.timeElapsed / 60)
  const secs = Math.floor(s.timeElapsed % 60).toString().padStart(2, '0')

  const lx = cx - 500
  const rows: [string, string][] = [
    ['CONTACTS DESTROYED', `${s.kills}  (${s.silentKills} silent)`],
    ['TORPEDO ACCURACY', `${acc}%  (${s.torpsHit}/${s.torpsFired})`],
    ['TIMES DETECTED', `${s.timesDetected}`],
    ['PINGS / DECOYS', `${s.pings} / ${s.decoysUsed}`],
    ['DAMAGE TAKEN', `${Math.round(s.damageTaken)}%`],
    ['DIVE TIME', `${mins}:${secs}`]
  ]
  drawText(ctx, 'AFTER-ACTION', lx, 480, 26, COLORS.hud, 'left', a2 * 0.7)
  rows.forEach((r, i) => {
    const y = 530 + i * 44
    drawText(ctx, r[0], lx, y, 27, COLORS.phos, 'left', a2 * 0.8)
    drawText(ctx, r[1], lx + 430, y, 27, COLORS.phosBright, 'left', a2 * 0.95)
  })

  const bd = app.breakdown
  const rx = cx + 180
  if (bd) {
    const brows: [string, number][] = [
      ['HUNTING', bd.hunting],
      ['ACCURACY BONUS', bd.accuracy],
      ...(won ? [['HULL BONUS', bd.hull] as [string, number], ['ASCENT BONUS', bd.win] as [string, number]] : [])
    ]
    drawText(ctx, 'SCORE', rx, 480, 26, COLORS.hud, 'left', a2 * 0.7)
    brows.forEach((r, i) => {
      const y = 530 + i * 44
      drawText(ctx, r[0], rx, y, 27, COLORS.phos, 'left', a2 * 0.8)
      drawText(ctx, `${r[1]}`, rx + 330, y, 27, COLORS.phosBright, 'right', a2 * 0.95)
    })
    const ty = 530 + brows.length * 44 + 10
    drawText(ctx, 'TOTAL', rx, ty, 34, COLORS.white, 'left', a2, 8)
    drawText(ctx, `${bd.total}`, rx + 330, ty, 34, COLORS.white, 'right', a2, 8)

    const rank = rankFor(bd.total)
    drawGlowText(ctx, rank.rank, rx + 440, 590, 170, won ? COLORS.phosBright : COLORS.amber, 'center', a2, 24)
    drawText(ctx, 'RATING', rx + 440, 490, 24, COLORS.hud, 'center', a2 * 0.7)
  }

  if (app.breakdown) {
    const rank = rankFor(app.breakdown.total)
    drawText(ctx, `"${rank.line}"`, cx, 830, 26, COLORS.hud, 'center', a2 * 0.75)
  }
  if (app.newBest) {
    const flash = 0.6 + 0.4 * Math.sin(t * 6)
    drawText(ctx, '* NEW BEST *', cx, 878, 30, COLORS.amber, 'center', a2 * flash, 10)
  } else if (app.save.best > 0) {
    drawText(ctx, `best ${app.save.best}`, cx, 878, 24, COLORS.hud, 'center', a2 * 0.6)
  }

  if (t > 0.8) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.4)
    drawText(ctx, '[ R - DIVE AGAIN ]        [ T - RETURN TO DOCK ]', cx, 960, 32, COLORS.white, 'center', pulse, 8)
  }
  ctx.restore()
}
