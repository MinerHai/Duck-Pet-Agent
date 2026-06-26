'use strict'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resize()
window.addEventListener('resize', resize)

let SETTINGS = {
  duckSize: 54,
  soundEnabled: true,
  honkVolume: 1,
  chaos: { enabled: false, footprints: true },
}

const duck = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  tx: window.innerWidth / 2,
  ty: window.innerHeight / 2,
  speed: 2.2,
  state: 'IDLE_ROAM',
  bob: 0,
}

function pickRoamTarget() {
  duck.tx = 60 + Math.random() * (window.innerWidth - 120)
  duck.ty = 60 + Math.random() * (window.innerHeight - 120)
}
setInterval(() => {
  if (duck.state === 'IDLE_ROAM') pickRoamTarget()
}, 2500)

// --- Footprints (gated by chaos settings) ---
let prints = []
setInterval(() => {
  const on = SETTINGS.chaos && SETTINGS.chaos.enabled && SETTINGS.chaos.footprints
  if (on && (duck.state === 'IDLE_ROAM' || duck.state === 'MISCHIEF')) {
    prints.push({ x: duck.x, y: duck.y + SETTINGS.duckSize / 2, life: 120 })
  }
  prints.forEach((p) => (p.life -= 1))
  prints = prints.filter((p) => p.life > 0)
}, 350)

// --- DONE celebration: short-lived confetti ---
let confetti = []
function spawnConfetti() {
  confetti = Array.from({ length: 40 }, () => ({
    x: duck.x,
    y: duck.y,
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

// --- Honk (WebAudio, no asset needed) ---
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

// --- Gift popup (meme image or note text) ---
const giftEl = document.getElementById('gift')
const giftImg = document.getElementById('giftImg')
const giftNote = document.getElementById('giftNote')
let giftTimer = null
function showGift(g) {
  clearTimeout(giftTimer)
  giftEl.style.left = Math.min(window.innerWidth - 230, Math.max(10, duck.x - 100)) + 'px'
  giftEl.style.top = Math.max(10, duck.y - 170) + 'px'
  if (g.type === 'meme') {
    giftImg.src = g.src
    giftImg.hidden = false
    giftNote.hidden = true
  } else {
    giftNote.textContent = g.text
    giftNote.hidden = false
    giftImg.hidden = true
  }
  giftEl.hidden = false
  giftTimer = setTimeout(() => {
    giftEl.hidden = true
  }, 4000)
}

// --- Main loop ---
function step() {
  const dx = duck.tx - duck.x
  const dy = duck.ty - duck.y
  const dist = Math.hypot(dx, dy)
  const moving = dist > 2
  if (moving) {
    duck.x += (dx / dist) * duck.speed
    duck.y += (dy / dist) * duck.speed
  }
  duck.bob += moving ? 0.25 : 0.06

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const p of prints) {
    ctx.globalAlpha = Math.min(0.4, p.life / 300)
    ctx.fillStyle = '#5b3a1a'
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, 6, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const bobY = Math.sin(duck.bob) * (moving ? 5 : 2)
  ctx.save()
  ctx.translate(duck.x, duck.y + bobY)
  if (duck.state === 'NEEDS_INPUT') {
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ff5252'
    ctx.fillText('HONK!', 0, -(SETTINGS.duckSize * 0.7))
    const pulse = 1 + Math.sin(duck.bob * 2) * 0.12
    ctx.scale(pulse, pulse)
  } else if (duck.state === 'WORKING') {
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⌨️', SETTINGS.duckSize * 0.4, -(SETTINGS.duckSize * 0.5))
  }
  if (dx < 0) ctx.scale(-1, 1)
  ctx.font = SETTINGS.duckSize + 'px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🦆', 0, 0)
  ctx.restore()

  if (duck.state === 'DONE') drawConfetti()

  requestAnimationFrame(step)
}
step()

// --- Bridge from main process ---
if (window.duckBridge) {
  let prev = duck.state
  window.duckBridge.onState((s) => {
    if (s === 'DONE' && prev !== 'DONE') spawnConfetti()
    if (s === 'NEEDS_INPUT' && prev !== 'NEEDS_INPUT') honk()
    duck.state = s
    prev = s
  })
  window.duckBridge.onCursor((p) => {
    if (duck.state === 'NEEDS_INPUT') {
      duck.tx = p.x
      duck.ty = p.y
    }
  })
  window.duckBridge.onSettings((s) => {
    SETTINGS = s
  })
  window.duckBridge.onGift((g) => showGift(g))
}
