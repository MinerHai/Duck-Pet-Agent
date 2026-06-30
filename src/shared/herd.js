// UMD: works under node:test (module.exports) and in the renderer (window.Herd).
// Pure helpers for the flock: per-duck size/colour variants and the coop/fence/trough layout.
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Herd = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

  // Three duck sizes whose multipliers follow consecutive Fibonacci numbers (3, 5, 8),
  // normalised so the medium duck is 1×. The same factor scales how long each duck stays
  // full, so bigger ducks get hungry proportionally slower.
  const FIB = { small: 3, medium: 5, large: 8 }
  const SIZE_TIERS = [
    { name: 'small', fib: FIB.small, mul: FIB.small / FIB.medium }, // 0.6×
    { name: 'medium', fib: FIB.medium, mul: FIB.medium / FIB.medium }, // 1.0×
    { name: 'large', fib: FIB.large, mul: FIB.large / FIB.medium }, // 1.6×
  ]

  // The seven rainbow colours, for a "bảy sắc cầu vồng" duck.
  const RAINBOW = ['#ff2d2d', '#ff8c00', '#ffd400', '#21c45e', '#1d6bff', '#5b2bd6', '#9400d3']

  const beakColor = (rng) => `hsl(${22 + Math.floor(rng() * 24)}, 92%, 52%)` // warm orange

  // One duck's colour scheme. `stops` is what the renderer paints the body with: a single
  // colour (solid), two colours (gradient), or the full rainbow. `edge` is the outline.
  function pickSkin(rng) {
    const roll = rng()
    if (roll < 0.3) {
      const h = Math.floor(rng() * 360)
      return { type: 'solid', stops: [`hsl(${h},78%,62%)`], edge: `hsl(${h},62%,40%)`, beak: beakColor(rng) }
    }
    if (roll < 0.75) {
      const h1 = Math.floor(rng() * 360)
      const h2 = (h1 + 60 + Math.floor(rng() * 180)) % 360 // a clearly different second hue
      return {
        type: 'gradient',
        stops: [`hsl(${h1},85%,64%)`, `hsl(${h2},85%,58%)`],
        edge: `hsl(${h1},55%,34%)`,
        beak: beakColor(rng),
      }
    }
    return { type: 'rainbow', stops: RAINBOW.slice(), edge: 'rgba(40,40,55,0.85)', beak: beakColor(rng) }
  }

  // One duck's look: a size tier + a colour skin.
  function pickVariant(rng) {
    const tier = SIZE_TIERS[Math.floor(rng() * SIZE_TIERS.length)]
    return { tier: tier.name, sizeMul: tier.mul, skin: pickSkin(rng) }
  }

  // The coop: a fenced pen with an entrance gap on the top rail, a feeding trough (máng)
  // inside, and a little shelter hut in a corner. Sized from the screen; positioned at
  // `anchor` (top-left) when the user has dragged it, else near the bottom-centre. Pure
  // geometry in canvas (DIP) space, always clamped fully on-screen.
  function coopLayout(bounds, anchor) {
    const w = Math.round(clamp(bounds.w * 0.34, 300, 480))
    const h = Math.round(clamp(bounds.h * 0.3, 200, 320))
    const hasAnchor = anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
    let x = hasAnchor ? Math.round(anchor.x) : Math.round(bounds.w / 2 - w / 2)
    let y = hasAnchor ? Math.round(anchor.y) : Math.round(bounds.h - h - 24)
    x = clamp(x, 0, Math.max(0, bounds.w - w))
    y = clamp(y, 0, Math.max(0, bounds.h - h))
    const entranceW = 90
    const tw = Math.round(w * 0.42)
    const th = 26
    return {
      x,
      y,
      w,
      h,
      entrance: { x: Math.round(x + w / 2 - entranceW / 2), w: entranceW },
      trough: { x: Math.round(x + w / 2 - tw / 2), y: Math.round(y + h - 58), w: tw, h: th },
      hut: { x: x + 22, y: y + 28, w: 96, h: 68 },
    }
  }

  // Centre of the trough — where food lands and ducks aim to peck.
  function troughCenter(coop) {
    return { x: coop.trough.x + coop.trough.w / 2, y: coop.trough.y + coop.trough.h / 2 }
  }

  // Is point (px,py) inside the coop's bounding rect? Used for drag hit-testing.
  function insideCoop(coop, px, py) {
    return px >= coop.x && px <= coop.x + coop.w && py >= coop.y && py <= coop.y + coop.h
  }

  return { SIZE_TIERS, RAINBOW, pickSkin, pickVariant, coopLayout, troughCenter, insideCoop }
})
