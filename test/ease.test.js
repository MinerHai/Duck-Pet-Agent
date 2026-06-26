'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { easePath } = require('../src/shared/ease')

test('easePath returns `steps` points starting at `from` ending at `to`', () => {
  const pts = easePath({ x: 0, y: 0 }, { x: 100, y: 50 }, 5)
  assert.strictEqual(pts.length, 5)
  assert.deepStrictEqual(pts[0], { x: 0, y: 0 })
  assert.deepStrictEqual(pts[pts.length - 1], { x: 100, y: 50 })
})

test('easePath points are monotonic along x toward the target', () => {
  const pts = easePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x >= pts[i - 1].x)
})

test('easePath with steps<=1 returns just the target', () => {
  assert.deepStrictEqual(easePath({ x: 1, y: 2 }, { x: 9, y: 9 }, 1), [{ x: 9, y: 9 }])
})
