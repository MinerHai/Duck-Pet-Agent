'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const {
  SIZE_TIERS,
  RAINBOW,
  pickSkin,
  pickVariant,
  coopLayout,
  troughCenter,
  insideCoop,
} = require('../src/shared/herd')

// A deterministic rng that walks a fixed sequence (clamped into [0,1)).
const seq = (vals) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

test('pickVariant returns one of the three size tiers and a full skin', () => {
  for (const r of [0, 0.5, 0.99]) {
    const v = pickVariant(seq([r, 0.1, 0.2, 0.3]))
    assert.ok(SIZE_TIERS.some((t) => t.mul === v.sizeMul && t.name === v.tier), `tier ${v.tier}`)
    assert.ok(['solid', 'gradient', 'rainbow'].includes(v.skin.type), `type ${v.skin.type}`)
    assert.ok(Array.isArray(v.skin.stops) && v.skin.stops.length >= 1, 'has stops')
    assert.match(v.skin.beak, /^hsl\(/)
    assert.ok(v.skin.edge, 'has edge')
  }
})

test('SIZE_TIERS multipliers follow consecutive Fibonacci numbers (3,5,8), medium = 1×', () => {
  const by = Object.fromEntries(SIZE_TIERS.map((t) => [t.name, t]))
  assert.deepStrictEqual([by.small.fib, by.medium.fib, by.large.fib], [3, 5, 8])
  assert.strictEqual(by.medium.mul, 1)
  assert.ok(Math.abs(by.small.mul - 3 / 5) < 1e-9, `small ${by.small.mul}`)
  assert.ok(Math.abs(by.large.mul - 8 / 5) < 1e-9, `large ${by.large.mul}`)
})

test('pickVariant maps the first rng draw to small/medium/large', () => {
  assert.strictEqual(pickVariant(seq([0.0, 0.1, 0, 0])).tier, 'small')
  assert.strictEqual(pickVariant(seq([0.5, 0.1, 0, 0])).tier, 'medium')
  assert.strictEqual(pickVariant(seq([0.9, 0.1, 0, 0])).tier, 'large')
})

test('pickSkin: roll selects solid / gradient / rainbow', () => {
  const solid = pickSkin(seq([0.1, 0.25, 0.5])) // roll<0.3
  assert.strictEqual(solid.type, 'solid')
  assert.strictEqual(solid.stops.length, 1)
  assert.strictEqual(solid.stops[0], 'hsl(90,78%,62%)') // h = floor(0.25*360)

  const grad = pickSkin(seq([0.5, 0.25, 0.5, 0.2])) // 0.3<=roll<0.75
  assert.strictEqual(grad.type, 'gradient')
  assert.strictEqual(grad.stops.length, 2)

  const rainbow = pickSkin(seq([0.9, 0.2])) // roll>=0.75
  assert.strictEqual(rainbow.type, 'rainbow')
  assert.deepStrictEqual(rainbow.stops, RAINBOW)
})

test('coopLayout keeps the pen, trough and entrance inside the screen bounds', () => {
  const bounds = { w: 1440, h: 900 }
  const c = coopLayout(bounds)
  assert.ok(c.x >= 0 && c.x + c.w <= bounds.w, 'pen within width')
  assert.ok(c.y >= 0 && c.y + c.h <= bounds.h, 'pen within height')
  assert.ok(c.trough.x >= c.x && c.trough.x + c.trough.w <= c.x + c.w, 'trough inside pen x')
  assert.ok(c.trough.y >= c.y && c.trough.y + c.trough.h <= c.y + c.h, 'trough inside pen y')
  assert.ok(c.entrance.x >= c.x && c.entrance.x + c.entrance.w <= c.x + c.w, 'entrance on top rail')
})

test('coopLayout clamps the pen size for tiny and huge screens', () => {
  assert.strictEqual(coopLayout({ w: 400, h: 300 }).w, 300) // min clamp
  assert.strictEqual(coopLayout({ w: 4000, h: 3000 }).w, 480) // max clamp
})

test('coopLayout honours a drag anchor and clamps it on-screen', () => {
  const b = { w: 1440, h: 900 }
  const c = coopLayout(b, { x: 120, y: 60 })
  assert.strictEqual(c.x, 120)
  assert.strictEqual(c.y, 60)
  const off = coopLayout(b, { x: 99999, y: 99999 })
  assert.ok(off.x + off.w <= b.w && off.y + off.h <= b.h, 'dragged off-screen is clamped back')
})

test('insideCoop hit-tests the pen rect', () => {
  const c = coopLayout({ w: 1440, h: 900 }, { x: 100, y: 100 })
  assert.ok(insideCoop(c, 110, 110))
  assert.ok(!insideCoop(c, 90, 90))
})

test('troughCenter is the centre of the trough rect', () => {
  const c = coopLayout({ w: 1440, h: 900 })
  const tc = troughCenter(c)
  assert.strictEqual(tc.x, c.trough.x + c.trough.w / 2)
  assert.strictEqual(tc.y, c.trough.y + c.trough.h / 2)
})
