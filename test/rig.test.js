'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const {
  computeRig,
  cubicEaseInOut,
  vecFromAngleDeg,
  lerpHeadingDeg,
  footStepTarget,
  pickWanderTarget,
} = require('../src/shared/rig')

const r = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) })

test('computeRig matches the goose formulas (pos 100,100, dir 0, neck 0)', () => {
  const rig = computeRig({ x: 100, y: 100, dir: 0, neckLerp: 0 })
  assert.deepStrictEqual(r(rig.bodyCenter), { x: 100, y: 86 })
  assert.deepStrictEqual(r(rig.underbodyCenter), { x: 100, y: 91 })
  assert.deepStrictEqual(r(rig.neckBase), { x: 115, y: 86 })
  assert.deepStrictEqual(r(rig.neckHeadPoint), { x: 118, y: 66 }) // num4=20 up, num5=3 fwd
  assert.deepStrictEqual(r(rig.head1End), { x: 121, y: 67 })
  assert.deepStrictEqual(r(rig.head2End), { x: 126, y: 67 })
  assert.deepStrictEqual(r(rig.beakTip), { x: 129, y: 67 })
  assert.deepStrictEqual(r(rig.footHomeL), { x: 100, y: 100 })
  assert.deepStrictEqual(r(rig.footHomeR), { x: 100, y: 106 })
})

test('computeRig: running neck lowers and reaches forward (neck 1)', () => {
  const rig = computeRig({ x: 100, y: 100, dir: 0, neckLerp: 1 })
  // num4=10 (lower), num5=16 (more forward): neckBase(115,86)+f*16=(131,86)+up*10=(131,76)
  assert.deepStrictEqual(r(rig.neckHeadPoint), { x: 131, y: 76 })
})

test('cubicEaseInOut endpoints and midpoint', () => {
  assert.strictEqual(cubicEaseInOut(0), 0)
  assert.strictEqual(cubicEaseInOut(0.5), 0.5)
  assert.strictEqual(cubicEaseInOut(1), 1)
})

test('vecFromAngleDeg basic directions', () => {
  assert.deepStrictEqual(r(vecFromAngleDeg(0)), { x: 1, y: 0 })
  assert.deepStrictEqual(r(vecFromAngleDeg(90)), { x: 0, y: 1 })
  assert.deepStrictEqual(r(vecFromAngleDeg(180)), { x: -1, y: 0 })
})

test('lerpHeadingDeg turns smoothly toward a target direction', () => {
  // from 0° toward (0,1) at t=0.25 -> atan2(0.25,0.75) ≈ 18.43°
  const d = lerpHeadingDeg(0, { x: 0, y: 1 }, 0.25)
  assert.ok(Math.abs(d - 18.4349) < 0.01, `got ${d}`)
})

test('footStepTarget overshoots the home by 2px along move dir', () => {
  assert.deepStrictEqual(footStepTarget({ x: 10, y: 10 }, { x: 1, y: 0 }), { x: 12, y: 10 })
})

test('pickWanderTarget stays in bounds and within the max hop', () => {
  const P = { x: 500, y: 400 }
  const bounds = { w: 1000, h: 800 }
  const t = pickWanderTarget(P, bounds, 80, () => 0.5)
  assert.ok(t.x >= 40 && t.x <= 960, `x ${t.x}`)
  assert.ok(t.y >= 40 && t.y <= 760, `y ${t.y}`)
  const hop = Math.hypot(t.x - P.x, t.y - P.y)
  assert.ok(hop <= (1 + 0.5 * 5) * 80 + 1e-6, `hop ${hop}`)
})
