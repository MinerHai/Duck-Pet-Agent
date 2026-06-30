'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { pickAdjacent, nextDisplay } = require('../src/main/displays')

const D = (id, x) => ({ id, bounds: { x, y: 0, width: 1440, height: 900 } })
const screens = [D(1, 0), D(2, 1440), D(3, 2880)] // three monitors in a row

test('pickAdjacent finds the monitor to the right / left', () => {
  assert.strictEqual(pickAdjacent(screens, 1, 'right').id, 2)
  assert.strictEqual(pickAdjacent(screens, 2, 'right').id, 3)
  assert.strictEqual(pickAdjacent(screens, 2, 'left').id, 1)
})

test('pickAdjacent returns null at the ends', () => {
  assert.strictEqual(pickAdjacent(screens, 1, 'left'), null)
  assert.strictEqual(pickAdjacent(screens, 3, 'right'), null)
})

test('pickAdjacent picks the nearest when several lie on one side', () => {
  assert.strictEqual(pickAdjacent(screens, 3, 'left').id, 2) // 2 is nearer than 1
})

test('nextDisplay cycles left→right and wraps', () => {
  assert.strictEqual(nextDisplay(screens, 1).id, 2)
  assert.strictEqual(nextDisplay(screens, 3).id, 1) // wrap
  assert.strictEqual(nextDisplay([D(9, 0)], 9), null) // single display
})
