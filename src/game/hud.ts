// Instrument-panel HUD: hull, tubes, bearing scope, activity, tickers, hints.

import { VIEW_W, VIEW_H, COLORS, PLAYER, ECHO } from '../config'
import { clamp, TAU, dist, angleTo } from '../engine/math'
import { drawText, drawBrackets } from '../engine/gfx'
import type { Run } from './types'

export function drawHud(run: Run, ctx: CanvasRenderingContext2D): void {
  const p = run.player

  ctx.save()

  // ---- top-left: zone + objective + score --------------------------------
  drawText(ctx, `-${run.zone.depth}M`, 42, 46, 40, COLORS.phosBright, 'left', 0.95)
  drawText(ctx, run.zone.name, 150, 46, 40, COLORS.hud, 'left', 0.9)
  const finale = run.zoneIdx === 5
  const objective = finale
    ? (run.beaconKnown ? 'REACH THE ASCENT STATION' : 'LOCATE THE ASCENT STATION')
    : run.hatchOpen
      ? 'QUOTA MET - DESCEND AT THE DROP SHAFT'
      : `CONTACTS TO CULL: ${run.quota}`
  drawText(ctx, objective, 42, 86, 26, run.hatchOpen || (finale && run.beaconKnown) ? COLORS.phosBright : COLORS.phos, 'left', 0.85)
  drawText(ctx, `SCORE ${run.score}`, 42, 120, 24, COLORS.hudDim === COLORS.hud ? COLORS.hud : COLORS.hud, 'left', 0.7)

  // ---- top-right: activity meter + detected lamp --------------------------
  const ax = VIEW_W - 42
  drawText(ctx, 'ACTIVITY', ax, 40, 22, COLORS.hud, 'right', 0.7)
  const barW = 190
  ctx.strokeStyle = COLORS.hudDim
  ctx.lineWidth = 1.5
  ctx.strokeRect(ax - barW, 52, barW, 10)
  const agit = run.agitation / 100
  ctx.fillStyle = agit > 0.75 ? COLORS.red : agit > 0.45 ? COLORS.amber : COLORS.phos
  ctx.globalAlpha = 0.8
  ctx.fillRect(ax - barW + 1, 53, (barW - 2) * agit, 8)
  ctx.globalAlpha = 1

  if (run.detectedFlash > 0) {
    const on = Math.sin(run.time * 10) > -0.2
    if (on) {
      drawText(ctx, '[ DETECTED ]', ax - barW / 2, 92, 30, COLORS.red, 'center', clamp(run.detectedFlash, 0, 1), 12)
    }
  }

  // ---- bottom-left: hull + flank -------------------------------------------
  const bx = 42
  const by = VIEW_H - 52
  drawText(ctx, 'HULL', bx, by - 38, 22, COLORS.hud, 'left', 0.7)
  const hullFrac = clamp(p.hull / run.d.hullMax, 0, 1)
  const segs = 12
  const segW = 22
  for (let i = 0; i < segs; i++) {
    const filled = hullFrac * segs > i + 0.01
    const col = hullFrac < 0.28 ? COLORS.red : hullFrac < 0.55 ? COLORS.amber : COLORS.phos
    ctx.fillStyle = filled ? col : 'rgba(30,80,60,0.25)'
    ctx.globalAlpha = filled ? (hullFrac < 0.28 ? 0.6 + 0.4 * Math.sin(run.time * 8) : 0.9) : 1
    ctx.fillRect(bx + i * (segW + 4), by - 26, segW, 14)
  }
  ctx.globalAlpha = 1
  drawText(ctx, `${Math.ceil(p.hull)}%`, bx + segs * (segW + 4) + 12, by - 19, 24, COLORS.phos, 'left', 0.85)

  drawText(ctx, 'FLANK', bx, by + 4, 18, COLORS.hud, 'left', 0.55)
  ctx.strokeStyle = COLORS.hudDim
  ctx.strokeRect(bx + 70, by - 3, 150, 8)
  ctx.fillStyle = p.flanking ? COLORS.amber : COLORS.phos
  ctx.globalAlpha = 0.7
  ctx.fillRect(bx + 71, by - 2, 148 * p.flankMeter, 6)
  ctx.globalAlpha = 1

  // ---- bottom-center: tubes + decoys ---------------------------------------
  const cx = VIEW_W / 2
  const cy = VIEW_H - 46
  drawText(ctx, 'TUBES', cx - 240, cy - 6, 20, COLORS.hud, 'right', 0.6)
  for (let i = 0; i < PLAYER.torpAmmoCap; i++) {
    const filled = i < p.ammo
    const x = cx - 214 + i * 24
    ctx.strokeStyle = filled ? COLORS.phosBright : COLORS.hudDim
    ctx.fillStyle = COLORS.phosBright
    ctx.lineWidth = 1.6
    ctx.globalAlpha = filled ? 0.95 : 0.35
    ctx.beginPath()
    ctx.moveTo(x, cy - 14)
    ctx.lineTo(x + 7, cy + 2)
    ctx.lineTo(x - 7, cy + 2)
    ctx.closePath()
    if (filled) ctx.fill()
    else ctx.stroke()
  }
  ctx.globalAlpha = 1
  // reload bar
  if (p.reload > 0) {
    const frac = 1 - p.reload / (PLAYER.torpReload * run.d.reloadMult)
    ctx.strokeStyle = COLORS.hudDim
    ctx.strokeRect(cx - 214, cy + 10, 220, 6)
    ctx.fillStyle = COLORS.phos
    ctx.fillRect(cx - 213, cy + 11, 218 * frac, 4)
  }
  drawText(ctx, 'DECOYS', cx + 110, cy - 6, 20, COLORS.hud, 'left', 0.6)
  for (let i = 0; i < run.d.decoyCap; i++) {
    const filled = i < p.decoys
    const x = cx + 205 + i * 26
    ctx.strokeStyle = filled ? COLORS.amber : COLORS.hudDim
    ctx.lineWidth = 1.6
    ctx.globalAlpha = filled ? 0.9 : 0.35
    ctx.beginPath()
    ctx.moveTo(x, cy - 13)
    ctx.lineTo(x + 8, cy - 5)
    ctx.lineTo(x, cy + 3)
    ctx.lineTo(x - 8, cy - 5)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // ---- bottom-right: bearing scope -----------------------------------------
  drawScope(run, ctx)

  // ---- tickers ---------------------------------------------------------------
  let ty = VIEW_H - 116
  for (let i = run.tickers.length - 1; i >= 0; i--) {
    const t = run.tickers[i]
    const a = clamp(t.t / 0.8, 0, 1) * 0.92
    drawText(ctx, t.text, cx, ty, 26, t.color, 'center', a)
    ty -= 34
  }

  drawHints(run, ctx)
  ctx.restore()
}

function drawScope(run: Run, ctx: CanvasRenderingContext2D): void {
  const p = run.player
  const sx = VIEW_W - 148
  const sy = VIEW_H - 150
  const R = 96

  ctx.save()
  ctx.strokeStyle = COLORS.hud
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(sx, sy, R, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.arc(sx, sy, R * 0.62, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(sx, sy, R * 0.3, 0, TAU)
  ctx.stroke()
  // cross hairs
  ctx.beginPath()
  ctx.moveTo(sx - R, sy); ctx.lineTo(sx + R, sy)
  ctx.moveTo(sx, sy - R); ctx.lineTo(sx, sy + R)
  ctx.stroke()
  ctx.globalAlpha = 1
  drawText(ctx, 'HYDROPHONE', sx, sy + R + 22, 18, COLORS.hud, 'center', 0.55)

  // heading wedge
  ctx.strokeStyle = COLORS.phosBright
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + Math.cos(p.heading) * 16, sy + Math.sin(p.heading) * 16)
  ctx.stroke()
  ctx.globalAlpha = 1

  // blips
  for (const b of run.blips) {
    const age = run.time - b.t
    const k = clamp(1 - age / ECHO.blipFade, 0, 1)
    const r = b.distNorm * (R - 10)
    const x = sx + Math.cos(b.bearing) * r
    const y = sy + Math.sin(b.bearing) * r
    const col = b.kind === 'boom' ? COLORS.white : b.hostile ? COLORS.amber : COLORS.phos
    ctx.fillStyle = col
    ctx.globalAlpha = k * (b.kind === 'boom' ? 1 : 0.8)
    const s = b.kind === 'boom' ? 5 : b.kind === 'call' ? 4 : 2.6
    ctx.fillRect(x - s / 2, y - s / 2, s, s)
  }
  ctx.globalAlpha = 1

  // objective bearing marker on the rim
  const finale = run.zoneIdx === 5
  const known = finale ? run.beaconKnown : (run.hatchOpen || run.world.hatchSeenT >= 0)
  if (known) {
    const hx = finale ? run.beaconX : run.world.hatchX
    const hy = finale ? run.beaconY : run.world.hatchY
    const b = angleTo(p.x, p.y, hx, hy)
    const x = sx + Math.cos(b) * (R + 9)
    const y = sy + Math.sin(b) * (R + 9)
    const active = finale || run.hatchOpen
    const pulse = active ? 0.5 + 0.5 * Math.sin(run.time * 4) : 0.4
    ctx.strokeStyle = active ? COLORS.phosBright : COLORS.hudDim
    ctx.globalAlpha = pulse
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 6)
    ctx.lineTo(x + 6, y)
    ctx.lineTo(x, y + 6)
    ctx.lineTo(x - 6, y)
    ctx.closePath()
    ctx.stroke()
    ctx.globalAlpha = 1
    // distance readout
    if (active) {
      const d = Math.round(dist(p.x, p.y, hx, hy) / 10) * 10
      drawText(ctx, `${d}`, sx, sy - R - 16, 20, COLORS.phos, 'center', 0.7)
    }
  }
  ctx.restore()
}

function drawHints(run: Run, ctx: CanvasRenderingContext2D): void {
  if (run.zoneIdx !== 0) return
  const h = run.hints
  const cx = VIEW_W / 2
  const y = VIEW_H - 210
  const pulse = 0.62 + 0.38 * Math.sin(run.time * 3.2)

  let text: string | null = null
  if (!h.moved) {
    text = 'HELM - W A S D      FLANK SPEED - SHIFT'
  } else if (!h.pinged && run.zoneTime > 4) {
    text = 'YOU ARE BLIND DOWN HERE. PING - SPACE or RIGHT MOUSE'
  } else if (h.pinged && !h.heardWarning) {
    h.warnT += 1 / 60
    text = 'EVERY SOUND YOU MAKE, THEY HEAR. SO LISTEN FIRST.'
    if (h.warnT > 4.5) h.heardWarning = true
  } else if (h.sawContact && !h.fired) {
    text = 'TORPEDO - LEFT MOUSE. LEAD THE TARGET.'
  } else if (h.fired && !h.killed && run.stats.kills > 0) {
    h.killed = true
  } else if (h.heardWarning && !h.sawContact && run.zoneTime > 14 && run.stats.kills === 0) {
    text = 'FOLLOW THE SCOPE BLIPS - THEIR SOUNDS BETRAY THEM. DECOY - E'
  }

  if (text) {
    drawText(ctx, `> ${text} <`, cx, y, 27, COLORS.phosBright, 'center', pulse)
  }
}

/** Pause-menu / title controls reference. */
export function drawControlsCard(ctx: CanvasRenderingContext2D, x: number, y: number, alpha = 1): void {
  const rows: [string, string][] = [
    ['W A S D', 'helm'],
    ['SHIFT', 'flank speed (loud)'],
    ['SPACE / RMB', 'sonar ping'],
    ['LMB', 'torpedo'],
    ['E', 'decoy'],
    ['P / ESC', 'hold station (pause)'],
    ['M', 'mute'],
    ['R', 'restart dive (when lost)']
  ]
  drawBrackets(ctx, x - 24, y - 34, 470, rows.length * 34 + 54, COLORS.hudDim, 16, alpha)
  drawText(ctx, 'HELM CARD', x, y, 24, COLORS.hud, 'left', alpha * 0.9)
  rows.forEach((r, i) => {
    const yy = y + 40 + i * 34
    drawText(ctx, r[0], x, yy, 26, COLORS.phosBright, 'left', alpha * 0.95)
    drawText(ctx, r[1], x + 210, yy, 26, COLORS.hud, 'left', alpha * 0.75)
  })
}
