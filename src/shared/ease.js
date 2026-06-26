'use strict'

// easeInOutQuad over t in [0,1]
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function easePath(from, to, steps) {
  if (steps <= 1) return [{ x: to.x, y: to.y }]
  const pts = []
  for (let i = 0; i < steps; i++) {
    const e = easeInOutQuad(i / (steps - 1))
    pts.push({
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
    })
  }
  return pts
}

module.exports = { easePath, easeInOutQuad }
