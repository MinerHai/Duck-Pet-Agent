'use strict'

// Fisher-Yates shuffle with an injectable rng (deterministic in tests).
function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// { footprints: 2, nab: 3 } -> ['footprints','footprints','nab','nab','nab']
function weightedExpand(weights) {
  const out = []
  for (const [k, n] of Object.entries(weights || {})) {
    for (let i = 0; i < n; i++) out.push(k)
  }
  return out
}

// Shuffle bag: deals every item once (in shuffled order) before reshuffling.
// Gives the goose's "guaranteed distribution" feel instead of streaky independent random.
class Deck {
  constructor(items, rng = Math.random) {
    this.items = items
    this.rng = rng
    this.pile = []
  }

  draw() {
    if (!this.items.length) return null
    if (!this.pile.length) this.pile = shuffle(this.items, this.rng)
    return this.pile.pop()
  }
}

module.exports = { shuffle, weightedExpand, Deck }
