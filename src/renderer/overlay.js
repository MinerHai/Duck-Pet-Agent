'use strict'
// Procedural duck rig + animation, faithful to DesktopGoose (TheGoose.cs), themed yellow.
const R = window.Rig

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resize()
window.addEventListener('resize', resize)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

let SETTINGS = {
  duckSize: 54,
  soundEnabled: true,
  honkVolume: 1,
  chaos: { enabled: false, footprints: true },
}

// Goose speed tiers: { speed px/s, accel px/s², step seconds }
const TIERS = {
  walk: { speed: 80, accel: 1300, step: 0.2 },
  run: { speed: 200, accel: 1300, step: 0.2 },
  charge: { speed: 400, accel: 2300, step: 0.1 },
}

const duck = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  vx: 0,
  vy: 0,
  dir: 0, // facing, degrees
  neck: 0, // neckLerpPercent (0 idle → 1 running)
  tx: window.innerWidth / 2,
  ty: window.innerHeight / 2,
  state: 'IDLE_ROAM',
  tier: 'walk',
  pauseUntil: 0, // wander pause (performance.now ms)
  mudUntil: 0, // run-amok window
}

// Gait: two feet, one steps at a time.
const feet = {
  l: { x: duck.x, y: duck.y, moveStart: -1, origin: null, dir: null },
  r: { x: duck.x, y: duck.y, moveStart: -1, origin: null, dir: null },
}

let cursor = { x: duck.x, y: duck.y } // streamed from main during NEEDS_INPUT (window-local)
let footMarks = [] // { x, y, t } in performance.now ms
let confetti = []
let lastT = performance.now()
let reachedFired = false // signalled main to grab the cursor this NEEDS_INPUT episode

// --- Speech bubble: makes the Claude interaction explicit (agentpet idea) ---
const LINES = {
  WORKING: ['Thinking…', 'On it!', 'Crunching code…', 'Wiring it up…'],
  NEEDS_INPUT: ['I need you! 👀', 'Your turn 👀', 'Psst, need input!', 'Awaiting orders…'],
  DONE: ['All done! ✅', 'Ta-da!', 'Nailed it!', 'Mission complete!'],
  IDLE_ROAM: ['Did you commit yet?', 'The build is quiet…', 'Tiny commit, tiny dopamine.', 'am duck, hjonk'],
}
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

// ---- Goal: pick tier + target for the current state. Returns true if pausing. ----
function updateGoal(nowMs) {
  if (duck.state === 'NEEDS_INPUT') {
    duck.tier = 'charge'
    duck.tx = cursor.x
    duck.ty = cursor.y
    return false
  }
  duck.tier = nowMs < duck.mudUntil ? 'run' : 'walk'
  const reached = Math.hypot(duck.tx - duck.x, duck.ty - duck.y) < 20
  if (reached) {
    if (!duck.pauseUntil) duck.pauseUntil = nowMs + 1000 + Math.random() * 1000 // 1–2s
    if (nowMs < duck.pauseUntil) return true
    duck.pauseUntil = 0
    const t = R.pickWanderTarget(
      duck,
      { w: window.innerWidth, h: window.innerHeight },
      TIERS[duck.tier].speed,
      Math.random,
    )
    duck.tx = t.x
    duck.ty = t.y
  }
  return false
}

// ---- Physics (port of TheGoose.Tick) ----
const ARRIVE = 24 // px: within this, brake instead of accelerate (no overshoot/turn-around)

function physics(dt, nowMs) {
  const paused = updateGoal(nowMs)
  const tier = TIERS[duck.tier]
  const toTarget = { x: duck.tx - duck.x, y: duck.ty - duck.y }
  const dist = Math.hypot(toTarget.x, toTarget.y)

  if (dist > 1) {
    duck.dir = R.lerpHeadingDeg(duck.dir, R.norm(toTarget), smooth(0.25, dt))
  }

  if (paused || dist < ARRIVE) {
    // Brake: settle on the target and follow a moving cursor without flipping 180°.
    const damp = Math.pow(0.001, dt) // frame-rate-independent heavy damping
    duck.vx *= damp
    duck.vy *= damp
    duck.x += duck.vx * dt
    duck.y += duck.vy * dt
  } else {
    const sp = Math.hypot(duck.vx, duck.vy)
    if (sp > tier.speed) {
      const n = tier.speed / sp
      duck.vx *= n
      duck.vy *= n
    }
    const tdir = R.norm(toTarget)
    duck.vx += tdir.x * tier.accel * dt
    duck.vy += tdir.y * tier.accel * dt
    duck.x += duck.vx * dt
    duck.y += duck.vy * dt
  }

  // Reached the cursor during NEEDS_INPUT → ask main to grab it (once per episode).
  if (duck.state === 'NEEDS_INPUT' && dist < 40 && !reachedFired) {
    reachedFired = true
    if (window.duckBridge && window.duckBridge.reachedCursor) window.duckBridge.reachedCursor()
  }

  const running = tier.speed >= 200 || duck.state === 'NEEDS_INPUT'
  duck.neck = R.lerp(duck.neck, running ? 1 : 0, smooth(0.075, dt))

  solveFeet(nowMs, tier.step)
}

// ---- Gait (port of TheGoose.SolveFeet) ----
function solveFeet(nowMs, stepTime) {
  const rig = R.computeRig({ x: duck.x, y: duck.y, dir: duck.dir, neckLerp: duck.neck })
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
    stepFoot(feet.l, homes.l, nowMs, stepTime)
  } else if (feet.r.moveStart >= 0) {
    stepFoot(feet.r, homes.r, nowMs, stepTime)
  }
}
function startStep(foot, home, nowMs) {
  foot.origin = { x: foot.x, y: foot.y }
  foot.dir = R.norm({ x: home.x - foot.x, y: home.y - foot.y })
  foot.moveStart = nowMs
}
function stepFoot(foot, home, nowMs, stepTime) {
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
  if (mudOn && (duck.state === 'IDLE_ROAM' || duck.state === 'MISCHIEF')) {
    footMarks.push({ x: foot.x, y: foot.y, t: nowMs })
    if (footMarks.length > 64) footMarks.shift()
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

function spawnConfetti() {
  confetti = Array.from({ length: 40 }, () => ({
    x: duck.x,
    y: duck.y - 30,
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

// ---- Render (port of TheGoose.Render), duck-themed ----
const COL = { body: '#FFD93D', edge: '#E0A92A', beak: '#FF8C00', eye: '#1a1a1a', mud: '#5b3a1a' }

function draw(nowMs) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const S = (SETTINGS.duckSize || 54) / 40
  const P = { x: duck.x, y: duck.y }

  // footmarks (world space; hold 8.5s then fade over 1s)
  for (const m of footMarks) {
    const fade = 1 - clamp((nowMs - (m.t + 8500)) / 1000, 0, 1)
    const rad = 3 * S * fade
    if (rad <= 0) continue
    ctx.globalAlpha = 0.5 * fade
    ctx.fillStyle = COL.mud
    ctx.beginPath()
    ctx.ellipse(m.x, m.y, rad, rad * 0.7, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const rig = R.computeRig({ x: P.x, y: P.y, dir: duck.dir, neckLerp: duck.neck })

  ctx.save()
  ctx.translate(P.x, P.y)
  ctx.scale(S, S)
  ctx.translate(-P.x, -P.y)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const line = (a, b, w, c) => {
    ctx.strokeStyle = c
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const dot = (p, r, c) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  dot(feet.l, 4, COL.beak)
  dot(feet.r, 4, COL.beak)

  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(P.x, P.y, 20, 15, 0, 0, Math.PI * 2)
  ctx.fill()

  // outline pass (edge)
  line(rig.bodyA, rig.bodyB, 24, COL.edge)
  line(rig.neckBase, rig.neckHeadPoint, 15, COL.edge)
  line(rig.neckHeadPoint, rig.head1End, 17, COL.edge)
  line(rig.head1End, rig.head2End, 12, COL.edge)
  line(rig.underA, rig.underB, 15, COL.edge)
  // fill pass (body)
  line(rig.bodyA, rig.bodyB, 22, COL.body)
  line(rig.neckBase, rig.neckHeadPoint, 13, COL.body)
  line(rig.neckHeadPoint, rig.head1End, 15, COL.body)
  line(rig.head1End, rig.head2End, 10, COL.body)
  // beak
  line(rig.head2End, rig.beakTip, 9, COL.beak)
  // eyes
  dot(rig.eyeL, 2, COL.eye)
  dot(rig.eyeR, 2, COL.eye)

  ctx.restore()

  // speech bubble (world space, above the head) — makes the Claude interaction explicit
  const headY = P.y + (rig.head2End.y - P.y) * S
  drawBubble(nowMs, P.x, headY, STATE_COLOR[duck.state] || '#9aa3ad', duck.state === 'NEEDS_INPUT')
  if (duck.state === 'DONE') drawConfetti()
}

// ---- Hover hit-test → right-click menu ----
// With click-through on, the renderer still gets forwarded mousemove; when the cursor is
// over the duck we ask main to make the window interactive so it can catch a right-click.
let mouseX = -1
let mouseY = -1
let hovering = false
window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX
  mouseY = e.clientY
})
window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  if (hovering && window.duckBridge && window.duckBridge.showMenu) window.duckBridge.showMenu()
})
function updateHover() {
  if (!window.duckBridge || !window.duckBridge.setHover) return
  const S = (SETTINGS.duckSize || 54) / 40
  const over = mouseX >= 0 && Math.hypot(mouseX - duck.x, mouseY - (duck.y - 18 * S)) < 44 * S
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

  physics(dt, now)
  duck.x = clamp(duck.x, 40, window.innerWidth - 40)
  duck.y = clamp(duck.y, 60, window.innerHeight - 20)
  footMarks = footMarks.filter((m) => now < m.t + 9500)

  updateHover()
  draw(now)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---- Bridge from main ----
if (window.duckBridge) {
  let prev = duck.state
  window.duckBridge.onState((s) => {
    if (s === 'DONE' && prev !== 'DONE') spawnConfetti()
    if (s === 'NEEDS_INPUT' && prev !== 'NEEDS_INPUT') honk()
    if (s === 'NEEDS_INPUT') reachedFired = false
    duck.state = s
    prev = s
    setBubbleForState(s, performance.now())
  })
  window.duckBridge.onCursor((p) => {
    cursor = p
  })
  window.duckBridge.onSettings((s) => {
    SETTINGS = s
  })
  window.duckBridge.onMud(() => {
    duck.mudUntil = performance.now() + 2000
  })
  window.duckBridge.onActivity((t) => {
    activityText = t
    if (duck.state === 'WORKING') {
      bubbleText = t
      bubbleUntil = 0
    }
  })
}
