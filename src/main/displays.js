'use strict'
// Pure helpers for moving the single-display overlay between monitors.

// The display immediately to the left/right of `currentId`, by horizontal position.
function pickAdjacent(displays, currentId, dir) {
  const cur = displays.find((d) => d.id === currentId)
  if (!cur) return null
  const side = displays.filter(
    (d) => d.id !== currentId && (dir === 'left' ? d.bounds.x < cur.bounds.x : d.bounds.x > cur.bounds.x),
  )
  if (!side.length) return null
  side.sort((a, b) => Math.abs(a.bounds.x - cur.bounds.x) - Math.abs(b.bounds.x - cur.bounds.x))
  return side[0]
}

// The next display when cycling left → right (wraps). For the "other monitor" menu item.
function nextDisplay(displays, currentId) {
  if (!displays || displays.length < 2) return null
  const sorted = [...displays].sort((a, b) => a.bounds.x - b.bounds.x)
  const i = sorted.findIndex((d) => d.id === currentId)
  return sorted[(i + 1) % sorted.length]
}

module.exports = { pickAdjacent, nextDisplay }
