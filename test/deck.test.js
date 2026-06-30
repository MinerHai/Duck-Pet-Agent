'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { shuffle, weightedExpand, Deck } = require('../src/main/deck')

test('shuffle is a deterministic permutation under an injected rng', () => {
  // Fisher-Yates with rng()=0 swaps each i with index 0.
  assert.deepStrictEqual(shuffle(['a', 'b', 'c'], () => 0), ['b', 'c', 'a'])
})

test('shuffle preserves the multiset of elements', () => {
  const out = shuffle([1, 2, 3, 4, 5], () => 0.5)
  assert.deepStrictEqual([...out].sort(), [1, 2, 3, 4, 5])
})

test('weightedExpand repeats each key by its weight', () => {
  assert.deepStrictEqual(weightedExpand({ footprints: 2, nab: 3 }), [
    'footprints', 'footprints', 'nab', 'nab', 'nab',
  ])
})

test('Deck deals every item once per cycle (shuffle bag, no replacement)', () => {
  const d = new Deck(['a', 'b', 'c'], () => 0.5)
  const cycle = [d.draw(), d.draw(), d.draw()].sort()
  assert.deepStrictEqual(cycle, ['a', 'b', 'c'])
  // 4th draw starts a fresh shuffled pile
  assert.ok(['a', 'b', 'c'].includes(d.draw()))
})

test('Deck over two full cycles yields the exact weighted distribution', () => {
  const items = weightedExpand({ x: 2, y: 1 }) // ['x','x','y']
  const d = new Deck(items, () => 0.3)
  const draws = Array.from({ length: 6 }, () => d.draw())
  const counts = draws.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {})
  assert.deepStrictEqual(counts, { x: 4, y: 2 })
})

test('Deck.draw on empty items returns null', () => {
  assert.strictEqual(new Deck([], () => 0).draw(), null)
})
