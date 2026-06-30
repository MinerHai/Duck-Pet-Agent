'use strict'
// Procedural duck rig + animation, faithful to DesktopGoose (TheGoose.cs), themed yellow.
// A whole flock now: each duck has one of three sizes and a random colour. The first duck is
// the "lead" — it carries the speech bubble and reacts to Claude's status; the rest wander.
// A toggleable coop (fence + trough/máng) lets you feed the flock from the menu.
const R = window.Rig
const H = window.Herd

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resize()
window.addEventListener('resize', resize)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const bounds = () => ({ w: window.innerWidth, h: window.innerHeight })

let SETTINGS = {
  duckSize: 54,
  duckCount: 4,
  hungerMinutes: 30,
  soundEnabled: true,
  honkVolume: 1,
  coop: { enabled: false, x: null, y: null },
  chaos: { enabled: false, footprints: true },
}

// Goose speed tiers: { speed px/s, accel px/s², step seconds }
const TIERS = {
  walk: { speed: 80, accel: 1300, step: 0.2 },
  run: { speed: 200, accel: 1300, step: 0.2 },
  charge: { speed: 400, accel: 2300, step: 0.1 },
}

// ---- The flock ----
function makeDuck() {
  const cx = window.innerWidth / 2 + (Math.random() - 0.5) * 200
  const cy = window.innerHeight / 2 + (Math.random() - 0.5) * 200
  const variant = H.pickVariant(Math.random)
  return {
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    dir: Math.random() * 360, // facing, degrees
    neck: 0, // neckLerpPercent (0 idle → 1 running)
    tx: cx,
    ty: cy,
    tier: 'walk',
    pauseUntil: 0, // wander pause (performance.now ms)
    mudUntil: 0, // run-amok window
    petUntil: 0, // while in the future the duck holds still (being petted)
    eatUntil: 0, // while in the future the duck is pecking at the trough
    lastPeck: 0,
    hunger: 0.5 + Math.random() * 0.5, // 0 = starving (lies down begging), 1 = full
    sizeMul: variant.sizeMul,
    skin: variant.skin,
    // Gait: two feet, one steps at a time.
    feet: {
      l: { x: cx, y: cy, moveStart: -1, origin: null, dir: null },
      r: { x: cx, y: cy, moveStart: -1, origin: null, dir: null },
    },
  }
}

let ducks = []
function rebuildFlock(n) {
  n = clamp(Math.round(n || 1), 1, 8)
  while (ducks.length < n) ducks.push(makeDuck())
  if (ducks.length > n) ducks.length = n // keep the lead (index 0)
}
rebuildFlock(SETTINGS.duckCount)
const lead = () => ducks[0]

let cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 } // streamed during NEEDS_INPUT
let footMarks = [] // { x, y, t } in performance.now ms
let confetti = []
let hearts = [] // petting hearts
let foodBits = [] // grain that pops when a duck pecks
let lastT = performance.now()
let acknowledged = false // lead petted → stop nagging/chasing until the next agent event
let state = 'IDLE_ROAM' // Claude status (drives the lead)

// ---- Coop position (draggable; null = default bottom-centre) ----
let coopPos = null // { x, y } top-left in canvas DIP, set by dragging
let drag = null // { dx, dy } offset from coop origin to the grab point while dragging the coop
let duckDrag = null // { duck, dx, dy, sx, sy, moved } while dragging an individual duck
const coopRect = () => H.coopLayout(bounds(), coopPos)
// When the coop is on, ducks wander this inner area (inset from the fence) instead of the screen.
function penInterior() {
  if (!(SETTINGS.coop && SETTINGS.coop.enabled)) return null
  const c = coopRect()
  return { x: c.x + 24, y: c.y + 24, w: Math.max(40, c.w - 48), h: Math.max(40, c.h - 48) }
}

// ---- Work/break tracking (nudge the user to rest after a long working stretch) ----
const BREAK_MS = 25 * 60 * 1000 // nag after ~25 min of cumulative WORKING
let workAccum = 0
let nextChatter = 0 // next idle quack/coding-nudge (performance.now ms)

// ---- Hunger: a medium duck empties in `hungerMinutes`; bigger ducks last proportionally longer.
const hungerSeconds = () => (SETTINGS.hungerMinutes || 30) * 60
const isStarving = (d) => d.hunger <= 0

// ---- Feeding (the máng) ----
const FEED_MS = 9000
const MAX_GRAINS = 16
let feed = { active: false, until: 0, grains: [] }
function startFeed(nowMs) {
  const c = coopRect()
  feed.active = true
  feed.until = nowMs + FEED_MS
  // Scatter grain inside the trough once, so the pile doesn't flicker frame to frame.
  feed.grains = Array.from({ length: MAX_GRAINS }, () => ({
    x: c.trough.x + 4 + Math.random() * (c.trough.w - 8),
    y: c.trough.y + 5 + Math.random() * (c.trough.h - 10),
  }))
}
// Where duck i should stand to eat: lined up along the front of the trough.
function feedSpot(c, i, n) {
  const span = c.trough.w + 30
  const t = n > 1 ? i / (n - 1) : 0.5
  return { x: c.trough.x - 15 + t * span, y: c.trough.y + c.trough.h + 16 }
}

// --- Speech bubble: makes the Claude interaction explicit (agentpet idea) ---
const QUACKS = ['Quack!', 'Quack quack!', 'Quaaaack 🦆', 'Hjonk!', 'Quack? 👀', 'Meep meep 🐤']
const CODING = [
  'Code đi nào! 👨‍💻',
  'Commit nhỏ, vui nhỏ 🦆',
  'Viết test chưa người ơi?',
  'Push code lên đi nào!',
  'Refactor tí cho thơm nào ✨',
  'Đừng quên lưu file nha 💾',
]
const BREAK = [
  'Làm lâu rồi, nghỉ tí đi 🦆',
  'Đứng dậy vươn vai nào!',
  'Nghỉ mắt 5 phút cho khoẻ 👀',
  'Uống miếng nước đã nào 💧',
  'Pomodoro xong rồi, break thôi!',
]
const LINES = {
  WORKING: ['Thinking…', 'On it!', 'Crunching code…', 'Wiring it up…'],
  NEEDS_INPUT: ['I need you! 👀', 'Your turn 👀', 'Psst, need input!', 'Awaiting orders…'],
  DONE: ['All done! ✅', 'Ta-da!', 'Nailed it!', 'Mission complete!'],
  IDLE_ROAM: ['Did you commit yet?', 'The build is quiet…', 'Tiny commit, tiny dopamine.', 'am duck, hjonk'],
}
// Idle chatter pool: quacks + coding nudges + the original idle musings.
const CHATTER = [...QUACKS, ...CODING, ...LINES.IDLE_ROAM]
const STATE_COLOR = {
  WORKING: '#3B82F6',
  NEEDS_INPUT: '#F59E0B',
  DONE: '#21C45E',
  IDLE_ROAM: '#9aa3ad',
  MISCHIEF: '#9aa3ad',
}
let bubbleText = ''
let bubbleUntil = 0 // performance.now ms; 0 = persist until state changes
let activityText = '' // live WORKING activity from main (from tool_name)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

function setBubbleForState(s, nowMs) {
  if (s === 'WORKING') {
    bubbleText = activityText || pick(LINES.WORKING)
    bubbleUntil = 0
  } else if (s === 'NEEDS_INPUT') {
    bubbleText = pick(LINES.NEEDS_INPUT)
    bubbleUntil = 0
  } else if (s === 'DONE') {
    bubbleText = pick(LINES.DONE)
    bubbleUntil = nowMs + 3500
  } else if (s === 'IDLE_ROAM') {
    bubbleText = Math.random() < 0.4 ? pick(LINES.IDLE_ROAM) : ''
    bubbleUntil = bubbleText ? nowMs + 4000 : 0
  } else {
    bubbleText = ''
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawBubble(nowMs, ax, ay, color, flash) {
  if (bubbleUntil && nowMs > bubbleUntil) bubbleText = ''
  if (!bubbleText) return
  ctx.save()
  ctx.font = '13px -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const padX = 10
  const w = Math.min(280, ctx.measureText(bubbleText).width + padX * 2)
  const h = 26
  const x = Math.max(4, Math.min(canvas.width - w - 4, ax - w / 2))
  const y = Math.max(4, ay - h - 12)
  ctx.globalAlpha = flash ? 0.6 + 0.4 * Math.abs(Math.sin(nowMs / 300)) : 1
  roundRect(x, y, w, h, 9)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.beginPath() // tail pointing down at the duck
  ctx.moveTo(ax - 6, y + h)
  ctx.lineTo(ax + 6, y + h)
  ctx.lineTo(ax, y + h + 8)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.fillText(bubbleText, x + padX, y + h / 2)
  ctx.restore()
}

// Frame-rate-independent smoothing: a per-frame rate calibrated at 120fps.
const smooth = (rate, dt) => 1 - Math.pow(1 - rate, dt * 120)

// ---- Goal: pick tier + target for one duck. Returns true if it should brake (pausing). ----
function updateGoal(d, isLead, nowMs) {
  // Being petted → hold still (overrides everything else).
  if (nowMs < d.petUntil) {
    d.tier = 'walk'
    d.tx = d.x
    d.ty = d.y
    return true
  }
  // Feeding: the whole flock rushes to the trough and pecks (an explicit user action wins).
  if (feed.active) {
    const c = coopRect()
    const i = ducks.indexOf(d)
    const spot = feedSpot(c, i < 0 ? 0 : i, ducks.length)
    d.tx = spot.x
    d.ty = spot.y
    const near = Math.hypot(spot.x - d.x, spot.y - d.y) < 22
    d.tier = near ? 'walk' : 'run'
    if (near) {
      d.eatUntil = nowMs + 400 // keep the head down while standing at the máng
      d.hunger = Math.min(1, d.hunger + 0.012) // pecking tops the belly back up
      if (nowMs - d.lastPeck > 320) {
        d.lastPeck = nowMs
        spawnPeck(d)
      }
      return true
    }
    return false
  }
  // Starving: out of food → lie down where it stands and beg (until someone feeds it).
  if (isStarving(d)) {
    d.tier = 'walk'
    d.tx = d.x
    d.ty = d.y
    return true
  }
  // NEEDS_INPUT: only the lead chases the cursor (running) until it's petted.
  if (isLead && state === 'NEEDS_INPUT' && !acknowledged) {
    d.tier = 'charge'
    d.tx = cursor.x
    d.ty = cursor.y
    return false
  }
  d.tier = nowMs < d.mudUntil ? 'run' : 'walk'
  const reached = Math.hypot(d.tx - d.x, d.ty - d.y) < 20
  if (reached) {
    if (!d.pauseUntil) d.pauseUntil = nowMs + 1000 + Math.random() * 1000 // 1–2s
    if (nowMs < d.pauseUntil) return true
    d.pauseUntil = 0
    const pen = penInterior()
    if (pen) {
      // stay home: pick the next spot inside the coop
      d.tx = pen.x + Math.random() * pen.w
      d.ty = pen.y + Math.random() * pen.h
    } else {
      const t = R.pickWanderTarget(d, bounds(), TIERS[d.tier].speed, Math.random)
      d.tx = t.x
      d.ty = t.y
    }
  }
  return false
}

// ---- Physics (port of TheGoose.Tick) ----
const ARRIVE = 24 // px: within this, brake instead of accelerate (no overshoot/turn-around)

function physics(d, isLead, dt, nowMs) {
  const paused = updateGoal(d, isLead, nowMs)
  const tier = TIERS[d.tier]
  const toTarget = { x: d.tx - d.x, y: d.ty - d.y }
  const dist = Math.hypot(toTarget.x, toTarget.y)

  if (dist > 1) {
    d.dir = R.lerpHeadingDeg(d.dir, R.norm(toTarget), smooth(0.25, dt))
  }

  if (paused || dist < ARRIVE) {
    // Brake: settle on the target and follow a moving cursor without flipping 180°.
    const damp = Math.pow(0.001, dt) // frame-rate-independent heavy damping
    d.vx *= damp
    d.vy *= damp
    d.x += d.vx * dt
    d.y += d.vy * dt
  } else {
    const sp = Math.hypot(d.vx, d.vy)
    if (sp > tier.speed) {
      const n = tier.speed / sp
      d.vx *= n
      d.vy *= n
    }
    const tdir = R.norm(toTarget)
    d.vx += tdir.x * tier.accel * dt
    d.vy += tdir.y * tier.accel * dt
    d.x += d.vx * dt
    d.y += d.vy * dt
  }

  const running = tier.speed >= 200 || (isLead && state === 'NEEDS_INPUT')
  const eating = nowMs < d.eatUntil
  d.neck = R.lerp(d.neck, running || eating ? 1 : 0, smooth(0.075, dt))

  solveFeet(d, nowMs, tier.step)
}

// ---- Gait (port of TheGoose.SolveFeet) ----
function solveFeet(d, nowMs, stepTime) {
  const feet = d.feet
  const rig = R.computeRig({ x: d.x, y: d.y, dir: d.dir, neckLerp: d.neck })
  const homes = { l: rig.footHomeL, r: rig.footHomeR }
  const idle = feet.l.moveStart < 0 && feet.r.moveStart < 0
  if (idle) {
    // Step whichever foot lags farther from its home — prevents one foot starving
    // (and being left behind) when the duck changes direction.
    const dL = Math.hypot(feet.l.x - homes.l.x, feet.l.y - homes.l.y)
    const dR = Math.hypot(feet.r.x - homes.r.x, feet.r.y - homes.r.y)
    if (dL > 5 || dR > 5) {
      if (dL >= dR) startStep(feet.l, homes.l, nowMs)
      else startStep(feet.r, homes.r, nowMs)
    }
  } else if (feet.l.moveStart >= 0) {
    stepFoot(d, feet.l, homes.l, nowMs, stepTime)
  } else if (feet.r.moveStart >= 0) {
    stepFoot(d, feet.r, homes.r, nowMs, stepTime)
  }
}
function startStep(foot, home, nowMs) {
  foot.origin = { x: foot.x, y: foot.y }
  foot.dir = R.norm({ x: home.x - foot.x, y: home.y - foot.y })
  foot.moveStart = nowMs
}
function stepFoot(d, foot, home, nowMs, stepTime) {
  const target = R.footStepTarget(home, foot.dir) // overshoot +2px
  const p = (nowMs - foot.moveStart) / (stepTime * 1000)
  if (p >= 1) {
    foot.x = target.x
    foot.y = target.y
    foot.moveStart = -1
    onFootLand(foot, nowMs)
  } else {
    const e = R.cubicEaseInOut(p)
    foot.x = R.lerp(foot.origin.x, target.x, e)
    foot.y = R.lerp(foot.origin.y, target.y, e)
  }
}
function onFootLand(foot, nowMs) {
  const mudOn = SETTINGS.chaos && SETTINGS.chaos.enabled && SETTINGS.chaos.footprints
  if (mudOn && (state === 'IDLE_ROAM' || state === 'MISCHIEF')) {
    footMarks.push({ x: foot.x, y: foot.y, t: nowMs })
    if (footMarks.length > 96) footMarks.shift()
  }
}

// ---- Honk (WebAudio, no asset) ----
const AudioCtx = window.AudioContext || window.webkitAudioContext
const audioCtx = AudioCtx ? new AudioCtx() : null
function honk() {
  if (!audioCtx || !SETTINGS.soundEnabled || SETTINGS.honkVolume <= 0) return
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  const o = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  o.type = 'sawtooth'
  o.frequency.value = 180
  g.gain.value = 0.001
  o.connect(g)
  g.connect(audioCtx.destination)
  const t = audioCtx.currentTime
  o.start()
  g.gain.exponentialRampToValueAtTime(0.3 * SETTINGS.honkVolume, t + 0.04)
  o.frequency.linearRampToValueAtTime(120, t + 0.18)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
  o.stop(t + 0.26)
}

function spawnConfetti(at) {
  confetti = Array.from({ length: 40 }, () => ({
    x: at.x,
    y: at.y - 30,
    vx: (Math.random() - 0.5) * 6,
    vy: -Math.random() * 6 - 2,
    c: `hsl(${Math.random() * 360},90%,60%)`,
    life: 60,
  }))
}
function drawConfetti() {
  for (const p of confetti) {
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.2
    p.life -= 1
    ctx.fillStyle = p.c
    ctx.fillRect(p.x, p.y, 5, 5)
  }
  confetti = confetti.filter((p) => p.life > 0)
}

// A peck spits a couple of grain flecks from the duck's beak.
function spawnPeck(d) {
  const S = duckScale(d)
  for (let i = 0; i < 2; i++) {
    foodBits.push({
      x: d.x + (Math.random() - 0.5) * 8 * S,
      y: d.y - 6 * S,
      vx: (Math.random() - 0.5) * 1.4,
      vy: -0.6 - Math.random(),
      life: 24 + Math.random() * 12,
    })
  }
}
function drawFoodBits() {
  ctx.fillStyle = '#C8902B'
  for (const b of foodBits) {
    b.x += b.vx
    b.y += b.vy
    b.vy += 0.12
    b.life -= 1
    ctx.globalAlpha = clamp(b.life / 30, 0, 1)
    ctx.fillRect(b.x, b.y, 3, 3)
  }
  ctx.globalAlpha = 1
  foodBits = foodBits.filter((b) => b.life > 0)
}

// Petting: left-click a duck → rising hearts + it holds still for a moment.
function spawnHearts(d) {
  d.petUntil = performance.now() + 2200
  const S = duckScale(d)
  for (let i = 0; i < 8; i++) {
    hearts.push({
      x: d.x + (Math.random() - 0.5) * 30 * S,
      y: d.y - 22 * S,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -1 - Math.random() * 1.5,
      life: 70 + Math.random() * 30,
      size: 12 + Math.random() * 10,
    })
  }
}
function drawHearts() {
  for (const h of hearts) {
    h.x += h.vx
    h.y += h.vy
    h.life -= 1
    ctx.globalAlpha = Math.max(0, h.life / 90)
    ctx.font = h.size + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('❤️', h.x, h.y)
  }
  ctx.globalAlpha = 1
  hearts = hearts.filter((h) => h.life > 0)
}

// ---- Coop: grassy yard + picket fence + barn hut + feeder trough (máng) ----
const WOOD = '#B07D42'
const WOOD_DK = '#7C5226'
const WOOD_LT = '#D6AC6E'
// Deterministic grass-tuft spots (fractions of the pen) so the lawn doesn't flicker.
const GRASS = [
  [0.12, 0.34], [0.27, 0.62], [0.4, 0.28], [0.55, 0.7], [0.68, 0.4],
  [0.8, 0.66], [0.9, 0.32], [0.18, 0.8], [0.6, 0.5], [0.34, 0.82],
]

// Behind the flock: shadow, lawn, back + side fence, the hut, and the trough.
function drawCoop(nowMs) {
  const showFull = SETTINGS.coop && SETTINGS.coop.enabled
  if (!showFull && !feed.active) return
  const c = coopRect()
  if (showFull) {
    drawYard(c)
    drawBackFence(c)
    drawHut(c)
  }
  drawTrough(c, nowMs)
}
// In front of the flock: the near (bottom) picket row, so ducks look penned inside.
function drawCoopFront() {
  if (!(SETTINGS.coop && SETTINGS.coop.enabled)) return
  const c = coopRect()
  ctx.save()
  picketRow(c.x + 4, c.x + c.w - 4, c.y + c.h, 20)
  woodRail(c.x + 2, c.x + c.w - 2, c.y + c.h - 7)
  ctx.restore()
}

function drawYard(c) {
  ctx.save()
  // soft drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  roundRect(c.x + 5, c.y + 12, c.w, c.h, 18)
  ctx.fill()
  // grass
  const g = ctx.createLinearGradient(0, c.y, 0, c.y + c.h)
  g.addColorStop(0, '#A9D277')
  g.addColorStop(1, '#84BB55')
  ctx.fillStyle = g
  roundRect(c.x, c.y, c.w, c.h, 16)
  ctx.fill()
  // dirt patch under the feeder
  const t = c.trough
  ctx.fillStyle = 'rgba(140,104,64,0.30)'
  ctx.beginPath()
  ctx.ellipse(t.x + t.w / 2, t.y + t.h / 2 + 8, t.w * 0.85, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  // grass tufts
  ctx.strokeStyle = '#5F9A3C'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const [fx, fy] of GRASS) {
    const x = c.x + fx * c.w
    const y = c.y + fy * c.h
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 3, y - 7)
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - 9)
    ctx.moveTo(x, y)
    ctx.lineTo(x + 3, y - 7)
    ctx.stroke()
  }
  ctx.restore()
}

// A single pointed-top picket standing up from baseline y.
function picket(x, baseY, h) {
  const w = 8
  const top = baseY - h
  ctx.beginPath()
  ctx.moveTo(x - w / 2, baseY)
  ctx.lineTo(x - w / 2, top + 5)
  ctx.lineTo(x, top)
  ctx.lineTo(x + w / 2, top + 5)
  ctx.lineTo(x + w / 2, baseY)
  ctx.closePath()
  ctx.fillStyle = WOOD
  ctx.fill()
  ctx.fillStyle = WOOD_LT
  ctx.fillRect(x - w / 2 + 1.5, top + 6, 1.8, h - 6)
  ctx.strokeStyle = WOOD_DK
  ctx.lineWidth = 1
  ctx.stroke()
}
function picketRow(x1, x2, baseY, h) {
  for (let x = x1 + 6; x <= x2; x += 15) picket(x, baseY, h)
}
function woodRail(x1, x2, y) {
  const h = 6
  ctx.fillStyle = WOOD_DK
  roundRect(x1, y - h / 2, x2 - x1, h, 3)
  ctx.fill()
  ctx.fillStyle = WOOD
  roundRect(x1, y - h / 2, x2 - x1, h - 2, 3)
  ctx.fill()
  ctx.fillStyle = WOOD_LT
  ctx.fillRect(x1 + 2, y - h / 2 + 1, x2 - x1 - 4, 1.4)
}
function fencePost(x, topY, botY) {
  ctx.fillStyle = WOOD_DK
  roundRect(x - 4, topY, 8, botY - topY, 3)
  ctx.fill()
  ctx.fillStyle = WOOD
  roundRect(x - 3, topY + 1, 6, botY - topY - 2, 3)
  ctx.fill()
  ctx.fillStyle = WOOD_DK // cap
  ctx.beginPath()
  ctx.moveTo(x - 5, topY)
  ctx.lineTo(x, topY - 5)
  ctx.lineTo(x + 5, topY)
  ctx.closePath()
  ctx.fill()
}
function drawBackFence(c) {
  ctx.save()
  // side rails (left & right), drawn first so posts sit on top
  woodRailV(c.x, c.y + 6, c.y + c.h)
  woodRailV(c.x + c.w, c.y + 6, c.y + c.h)
  // back picket row across the top, split around the entrance gap
  picketRow(c.x + 4, c.entrance.x - 4, c.y, 22)
  picketRow(c.entrance.x + c.entrance.w + 2, c.x + c.w - 4, c.y, 22)
  woodRail(c.x + 2, c.entrance.x, c.y + 8)
  woodRail(c.entrance.x + c.entrance.w, c.x + c.w - 2, c.y + 8)
  // corner + entrance posts
  fencePost(c.x, c.y - 6, c.y + c.h)
  fencePost(c.x + c.w, c.y - 6, c.y + c.h)
  const e1 = c.entrance.x
  const e2 = c.entrance.x + c.entrance.w
  fencePost(e1, c.y - 14, c.y + c.h)
  fencePost(e2, c.y - 14, c.y + c.h)
  // a little welcome sign above the gate
  ctx.fillStyle = WOOD
  roundRect(e1 - 2, c.y - 26, e2 - e1 + 4, 16, 4)
  ctx.fill()
  ctx.fillStyle = '#fff7e6'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🦆', (e1 + e2) / 2, c.y - 18)
  ctx.restore()
}
function woodRailV(x, y1, y2) {
  ctx.fillStyle = WOOD_DK
  roundRect(x - 3, y1, 6, y2 - y1, 3)
  ctx.fill()
  ctx.fillStyle = WOOD
  roundRect(x - 2, y1, 4, y2 - y1, 3)
  ctx.fill()
}

function drawHut(c) {
  const { x, y, w, h } = c.hut
  ctx.save()
  // cream barn body
  ctx.fillStyle = '#F3E6CA'
  roundRect(x, y + 16, w, h - 16, 4)
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.06)' // subtle floor shade
  ctx.fillRect(x, y + h - 8, w, 8)
  // red gable roof with a ridge + eaves
  const roof = ctx.createLinearGradient(0, y - 10, 0, y + 22)
  roof.addColorStop(0, '#D2554A')
  roof.addColorStop(1, '#A93B30')
  ctx.fillStyle = roof
  ctx.beginPath()
  ctx.moveTo(x - 9, y + 22)
  ctx.lineTo(x + w / 2, y - 12)
  ctx.lineTo(x + w + 9, y + 22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#8E3026' // ridge line
  ctx.fillRect(x - 9, y + 20, w + 18, 3)
  // gable heart
  ctx.fillStyle = '#E8736A'
  drawHeart(x + w / 2, y + 4, 4)
  // round window
  ctx.fillStyle = '#7FB4D6'
  ctx.beginPath()
  ctx.arc(x + w - 22, y + 34, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#F3E6CA'
  ctx.lineWidth = 2
  ctx.stroke()
  // arched door
  ctx.fillStyle = '#5B3A1E'
  const dw = 24
  const dx = x + 14
  const dy = y + h
  ctx.beginPath()
  ctx.moveTo(dx, dy)
  ctx.lineTo(dx, dy - 22)
  ctx.arc(dx + dw / 2, dy - 22, dw / 2, Math.PI, 0)
  ctx.lineTo(dx + dw, dy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
function drawHeart(cx, cy, r) {
  ctx.beginPath()
  ctx.moveTo(cx, cy + r)
  ctx.bezierCurveTo(cx + r * 1.3, cy - r * 0.4, cx + r * 0.4, cy - r * 1.3, cx, cy - r * 0.4)
  ctx.bezierCurveTo(cx - r * 0.4, cy - r * 1.3, cx - r * 1.3, cy - r * 0.4, cx, cy + r)
  ctx.closePath()
  ctx.fill()
}

function drawTrough(c, nowMs) {
  const t = c.trough
  ctx.save()
  // legs
  ctx.fillStyle = WOOD_DK
  ctx.fillRect(t.x + 4, t.y + t.h - 2, 5, 8)
  ctx.fillRect(t.x + t.w - 9, t.y + t.h - 2, 5, 8)
  // trapezoidal bin (wider at the top)
  ctx.fillStyle = WOOD_DK
  ctx.beginPath()
  ctx.moveTo(t.x - 5, t.y)
  ctx.lineTo(t.x + t.w + 5, t.y)
  ctx.lineTo(t.x + t.w - 3, t.y + t.h)
  ctx.lineTo(t.x + 3, t.y + t.h)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = WOOD
  ctx.beginPath()
  ctx.moveTo(t.x - 2, t.y + 3)
  ctx.lineTo(t.x + t.w + 2, t.y + 3)
  ctx.lineTo(t.x + t.w - 3, t.y + t.h - 1)
  ctx.lineTo(t.x + 3, t.y + t.h - 1)
  ctx.closePath()
  ctx.fill()
  // rim highlight
  ctx.fillStyle = WOOD_LT
  ctx.fillRect(t.x - 4, t.y, t.w + 8, 2.5)
  // grain pile, shrinking as feeding time runs out
  if (feed.active) {
    const left = clamp((feed.until - nowMs) / FEED_MS, 0, 1)
    const show = Math.ceil(feed.grains.length * left)
    for (let i = 0; i < show; i++) {
      const grn = feed.grains[i]
      ctx.fillStyle = i % 3 === 0 ? '#F0C44C' : '#E3B23C'
      ctx.beginPath()
      ctx.ellipse(grn.x, grn.y, 2.3, 1.7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

// ---- Per-duck render (port of TheGoose.Render), themed ----
function duckScale(d) {
  return ((SETTINGS.duckSize || 54) / 40) * (d.sizeMul || 1)
}

// A little hunger bar floating above each duck (green → yellow → red); a starving duck
// blinks a "feed me" plea.
function drawHungerBar(d, nowMs) {
  const S = duckScale(d)
  const w = 28
  const h = 4
  const x = d.x - w / 2
  const y = d.y - 40 * S - 8
  const lvl = clamp(d.hunger, 0, 1)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  roundRect(x - 1, y - 1, w + 2, h + 2, 3)
  ctx.fill()
  const col = lvl > 0.5 ? '#21c45e' : lvl > 0.25 ? '#f5c518' : '#ef4444'
  ctx.fillStyle = col
  if (lvl > 0) {
    roundRect(x, y, w * lvl, h, 2)
    ctx.fill()
  }
  if (isStarving(d) && Math.sin(nowMs / 250) > 0) {
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🌾❓', d.x, y - 6)
  }
}

function drawDuck(d, nowMs) {
  const S = duckScale(d)
  const P = { x: d.x, y: d.y }
  const sk = d.skin
  const starv = isStarving(d)
  const rig = R.computeRig({ x: P.x, y: P.y, dir: d.dir, neckLerp: d.neck })

  ctx.save()
  ctx.translate(P.x, P.y)
  ctx.scale(starv ? S * 1.1 : S, starv ? S * 0.7 : S) // starving → slumped, lying down
  ctx.translate(-P.x, -P.y)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Body paint: a flat colour, or a gradient running tail → beak (2-colour or 7-colour rainbow).
  let body = sk.stops[0]
  if (sk.type !== 'solid') {
    const g = ctx.createLinearGradient(rig.bodyB.x, rig.bodyB.y, rig.beakTip.x, rig.beakTip.y)
    const n = sk.stops.length
    sk.stops.forEach((c, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), c))
    body = g
  }

  const line = (a, b, w, col) => {
    ctx.strokeStyle = col
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const dot = (p, r, col) => {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  dot(d.feet.l, 4, sk.beak)
  dot(d.feet.r, 4, sk.beak)

  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(P.x, P.y, 20, 15, 0, 0, Math.PI * 2)
  ctx.fill()

  // outline pass (edge)
  line(rig.bodyA, rig.bodyB, 24, sk.edge)
  line(rig.neckBase, rig.neckHeadPoint, 15, sk.edge)
  line(rig.neckHeadPoint, rig.head1End, 17, sk.edge)
  line(rig.head1End, rig.head2End, 12, sk.edge)
  line(rig.underA, rig.underB, 15, sk.edge)
  // fill pass (body)
  line(rig.bodyA, rig.bodyB, 22, body)
  line(rig.neckBase, rig.neckHeadPoint, 13, body)
  line(rig.neckHeadPoint, rig.head1End, 15, body)
  line(rig.head1End, rig.head2End, 10, body)
  // beak
  line(rig.head2End, rig.beakTip, 9, sk.beak)
  // eyes
  dot(rig.eyeL, 2, '#1a1a1a')
  dot(rig.eyeR, 2, '#1a1a1a')

  ctx.restore()
  drawHungerBar(d, nowMs)
  return rig
}

function draw(nowMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // coop sits behind the flock
  drawCoop(nowMs)

  // footmarks (world space; hold 8.5s then fade over 1s)
  for (const m of footMarks) {
    const fade = 1 - clamp((nowMs - (m.t + 8500)) / 1000, 0, 1)
    const rad = 3 * fade
    if (rad <= 0) continue
    ctx.globalAlpha = 0.5 * fade
    ctx.fillStyle = '#5b3a1a'
    ctx.beginPath()
    ctx.ellipse(m.x, m.y, rad, rad * 0.7, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // draw back-to-front so lower ducks overlap higher ones
  const order = ducks.slice().sort((a, b) => a.y - b.y)
  let leadRig = null
  for (const d of order) {
    const rig = drawDuck(d, nowMs)
    if (d === lead()) leadRig = rig
  }

  // front fence draws over the ducks so they look like they're standing inside the pen
  drawCoopFront()

  // speech bubble (above the lead's head) — makes the Claude interaction explicit
  const L = lead()
  if (leadRig) {
    const S = duckScale(L)
    const headY = L.y + (leadRig.head2End.y - L.y) * S
    drawBubble(nowMs, L.x, headY, STATE_COLOR[state] || '#9aa3ad', state === 'NEEDS_INPUT')
  }
  if (state === 'DONE') drawConfetti()
  drawFoodBits()
  drawHearts()
}

// ---- Hover hit-test → right-click menu; left-click to pet a duck; drag the coop ----
let mouseX = -1
let mouseY = -1
let hovering = false
function duckAt(mx, my) {
  if (mx < 0) return null
  // top-most (front / lowest on screen) first
  const order = ducks.slice().sort((a, b) => b.y - a.y)
  for (const d of order) {
    const S = duckScale(d)
    if (Math.hypot(mx - d.x, my - (d.y - 18 * S)) < 44 * S) return d
  }
  return null
}
const coopHover = (mx, my) =>
  !!(SETTINGS.coop && SETTINGS.coop.enabled) && mx >= 0 && H.insideCoop(coopRect(), mx, my)
// The trough is visible (and so clickable to feed) whenever the coop is on or food is out.
const troughVisible = () => !!(SETTINGS.coop && SETTINGS.coop.enabled) || feed.active
function troughAt(mx, my) {
  if (mx < 0 || !troughVisible()) return false
  const t = coopRect().trough
  return mx >= t.x - 6 && mx <= t.x + t.w + 6 && my >= t.y - 6 && my <= t.y + t.h + 6
}

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX
  mouseY = e.clientY
  if (drag) coopPos = { x: mouseX - drag.dx, y: mouseY - drag.dy } // coopLayout clamps on-screen
  if (duckDrag) {
    if (!duckDrag.moved && Math.hypot(mouseX - duckDrag.sx, mouseY - duckDrag.sy) > 4) {
      duckDrag.moved = true
      duckDrag.duck.held = true // it became a drag, not a tap
    }
    if (duckDrag.moved) {
      let nx = clamp(mouseX - duckDrag.dx, 40, window.innerWidth - 40)
      let ny = clamp(mouseY - duckDrag.dy, 60, window.innerHeight - 20)
      const pen = penInterior()
      if (pen) {
        // coop on → can't pull a duck out of the pen
        nx = clamp(nx, pen.x, pen.x + pen.w)
        ny = clamp(ny, pen.y, pen.y + pen.h)
      }
      duckDrag.duck.x = nx
      duckDrag.duck.y = ny
    }
  }
})
window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  if (hovering && window.duckBridge && window.duckBridge.showMenu) window.duckBridge.showMenu()
})
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  // click the máng → feed the flock
  if (troughAt(mouseX, mouseY)) {
    startFeed(performance.now())
    return
  }
  // grab a duck: a tap pets it, a drag carries it
  const d = duckAt(mouseX, mouseY)
  if (d) {
    duckDrag = { duck: d, dx: mouseX - d.x, dy: mouseY - d.y, sx: mouseX, sy: mouseY, moved: false }
    return
  }
  // empty spot inside the coop → grab it and start dragging the coop
  if (coopHover(mouseX, mouseY)) {
    const c = coopRect()
    coopPos = { x: c.x, y: c.y }
    drag = { dx: mouseX - c.x, dy: mouseY - c.y }
  }
})
window.addEventListener('mouseup', () => {
  if (duckDrag) {
    const d = duckDrag.duck
    if (!duckDrag.moved) {
      // a tap (no drag) → pet it
      if (d === lead()) {
        acknowledged = true
        bubbleText = ''
        bubbleUntil = 0
      }
      spawnHearts(d)
    } else {
      d.held = false // dropped — resume roaming from here
    }
    duckDrag = null
    return
  }
  if (drag) {
    drag = null
    const c = coopRect()
    if (window.duckBridge && window.duckBridge.moveCoop) window.duckBridge.moveCoop({ x: c.x, y: c.y })
  }
})
function updateHover() {
  if (!window.duckBridge || !window.duckBridge.setHover) return
  const over =
    !!drag || !!duckDrag || !!duckAt(mouseX, mouseY) || coopHover(mouseX, mouseY) || troughAt(mouseX, mouseY)
  if (over !== hovering) {
    hovering = over
    window.duckBridge.setHover(over)
  }
}

// ---- Main loop ----
function frame() {
  const now = performance.now()
  let dt = (now - lastT) / 1000
  lastT = now
  if (dt > 0.1) dt = 0.1 // clamp big gaps (inactive tab)

  if (feed.active && now > feed.until) feed.active = false

  const L = lead()
  const pen = penInterior()
  for (const d of ducks) {
    // hunger drains over time; bigger ducks (sizeMul) take proportionally longer to empty
    d.hunger = clamp(d.hunger - dt / (hungerSeconds() * d.sizeMul), 0, 1)
    if (d.held) {
      d.vx = d.vy = 0 // being carried by the cursor — position is set in mousemove
      d.tx = d.x
      d.ty = d.y
      continue
    }
    physics(d, d === L, dt, now)
    d.x = clamp(d.x, 40, window.innerWidth - 40)
    d.y = clamp(d.y, 60, window.innerHeight - 20)
    if (pen) {
      // coop on → keep every duck penned in (can't get out)
      d.x = clamp(d.x, pen.x, pen.x + pen.w)
      d.y = clamp(d.y, pen.y, pen.y + pen.h)
    }
  }
  footMarks = footMarks.filter((m) => now < m.t + 9500)

  maybeCrossDisplay(now)
  updateChatter(now, dt)
  updateHover()
  draw(now)
  requestAnimationFrame(frame)
}

// While dragging the coop to the very left/right edge, ask main to hop the overlay to the
// monitor on that side (macOS can't span one window across two displays, so we relocate).
let crossReqAt = 0
function maybeCrossDisplay(now) {
  if (!drag) return
  const dir = mouseX <= 4 ? 'left' : mouseX >= canvas.width - 4 ? 'right' : null
  if (!dir || now - crossReqAt < 800) return
  crossReqAt = now
  if (window.duckBridge && window.duckBridge.crossCoop) window.duckBridge.crossCoop(dir)
}

// Idle quacks/coding nudges + a "take a break" nudge after a long working stretch.
function updateChatter(now, dt) {
  if (state === 'WORKING') {
    workAccum += dt * 1000
    if (workAccum >= BREAK_MS) {
      workAccum = 0
      bubbleText = pick(BREAK)
      bubbleUntil = now + 6000
    }
  }
  if (state === 'IDLE_ROAM') {
    if (!nextChatter) nextChatter = now + 8000
    const free = !bubbleText || (bubbleUntil && now > bubbleUntil)
    if (now >= nextChatter && free) {
      bubbleText = pick(CHATTER)
      bubbleUntil = now + 3500
      nextChatter = now + 12000 + Math.random() * 15000
    }
  } else {
    nextChatter = 0
  }
}
requestAnimationFrame(frame)

// ---- Bridge from main ----
if (window.duckBridge) {
  let prev = state
  window.duckBridge.onState((s) => {
    if (s === 'DONE' && prev !== 'DONE') spawnConfetti(lead())
    if (s === 'NEEDS_INPUT' && prev !== 'NEEDS_INPUT') honk()
    acknowledged = false // a new agent event re-engages the lead
    state = s
    prev = s
    setBubbleForState(s, performance.now())
  })
  window.duckBridge.onCursor((p) => {
    cursor = p
  })
  window.duckBridge.onSettings((s) => {
    const wasCoop = !!(SETTINGS.coop && SETTINGS.coop.enabled)
    SETTINGS = s
    rebuildFlock(s.duckCount)
    // adopt a persisted dragged position (unless the user is mid-drag)
    if (!drag) {
      coopPos =
        s.coop && Number.isFinite(s.coop.x) && Number.isFinite(s.coop.y)
          ? { x: s.coop.x, y: s.coop.y }
          : null
    }
    // coop just turned on → herd everyone into the pen
    if (s.coop && s.coop.enabled && !wasCoop) {
      const pen = penInterior()
      if (pen)
        for (const d of ducks) {
          d.tx = pen.x + Math.random() * pen.w
          d.ty = pen.y + Math.random() * pen.h
          d.pauseUntil = 0
        }
    }
  })
  window.duckBridge.onMud(() => {
    for (const d of ducks) d.mudUntil = performance.now() + 2000 // whole flock runs amok
  })
  window.duckBridge.onActivity((t) => {
    activityText = t
    if (state === 'WORKING') {
      bubbleText = t
      bubbleUntil = 0
    }
  })
  if (window.duckBridge.onFeed) window.duckBridge.onFeed(() => startFeed(performance.now()))
  // The overlay hopped to an adjacent monitor — drop the coop at the edge it entered from.
  if (window.duckBridge.onCoopPlace)
    window.duckBridge.onCoopPlace((edge) => {
      drag = null
      const c0 = H.coopLayout(bounds())
      const x = edge === 'right' ? Math.max(0, window.innerWidth - c0.w) : 0
      coopPos = { x, y: c0.y }
      if (window.duckBridge.moveCoop) window.duckBridge.moveCoop({ x, y: c0.y })
    })
}
