// UMD: works under node:test (module.exports) and in the renderer (window.Rig).
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Rig = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const D2R = Math.PI / 180

  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
  const mul = (a, s) => ({ x: a.x * s, y: a.y * s })
  const mulv = (a, b) => ({ x: a.x * b.x, y: a.y * b.y })
  const len = (a) => Math.hypot(a.x, a.y)
  const norm = (a) => {
    const l = len(a) || 1
    return { x: a.x / l, y: a.y / l }
  }
  const lerp = (a, b, t) => a + (b - a) * t
  const vlerp = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })

  function vecFromAngleDeg(deg) {
    return { x: Math.cos(deg * D2R), y: Math.sin(deg * D2R) }
  }

  function cubicEaseInOut(p) {
    if (p < 0.5) return 4 * p * p * p
    const n = 2 * p - 2
    return 0.5 * n * n * n + 1
  }

  // Lerp current heading (deg) toward a unit target-direction vector; returns new degrees.
  function lerpHeadingDeg(currentDeg, targetDir, t) {
    const v = vlerp(vecFromAngleDeg(currentDeg), targetDir, t)
    return Math.atan2(v.y, v.x) / D2R
  }

  const UP = { x: 0, y: -1 }
  const SQUASH = { x: 1.3, y: 0.4 }

  // All offsets are the goose's exact constants (TheGoose.UpdateRig).
  function computeRig({ x, y, dir, neckLerp }) {
    const P = { x, y }
    const f = vecFromAngleDeg(dir)
    const perp = vecFromAngleDeg(dir + 90)
    const num4 = lerp(20, 10, neckLerp) // neck height (tall idle, low running)
    const num5 = lerp(3, 16, neckLerp) // neck forward reach
    const underbodyCenter = add(P, mul(UP, 9))
    const bodyCenter = add(P, mul(UP, 14))
    const neckBase = add(bodyCenter, mul(f, 15))
    const neckHeadPoint = add(add(neckBase, mul(f, num5)), mul(UP, num4))
    const head1End = sub(add(neckHeadPoint, mul(f, 3)), UP) // + f*3 - up*1 (dips 1px)
    const head2End = add(head1End, mul(f, 5))
    const beakTip = add(head2End, mul(f, 3))
    const eyeBase = add(add(neckHeadPoint, mul(UP, 3)), mul(f, 5))
    const eyeOff = mul(mulv(perp, SQUASH), 5)
    return {
      P,
      f,
      perp,
      underbodyCenter,
      bodyCenter,
      neckBase,
      neckHeadPoint,
      head1End,
      head2End,
      beakTip,
      eyeL: sub(eyeBase, eyeOff),
      eyeR: add(eyeBase, eyeOff),
      footHomeL: { x: P.x, y: P.y }, // perp * 0
      footHomeR: add(P, mul(perp, 6)), // perp * 6
      bodyA: add(bodyCenter, mul(f, 11)),
      bodyB: sub(bodyCenter, mul(f, 11)),
      underA: add(underbodyCenter, mul(f, 7)),
      underB: sub(underbodyCenter, mul(f, 7)),
    }
  }

  // A stepping foot overshoots its home by 0.4*5 = 2px along the move direction.
  function footStepTarget(home, moveDir) {
    return add(home, mul(moveDir, 2))
  }

  // Pick a wander target: a hop of random length up to (1..6)×speed, kept inside bounds.
  function pickWanderTarget(P, bounds, speed, rng) {
    const maxHop = (1 + rng() * 5) * speed
    const ang = rng() * Math.PI * 2
    const dist = (0.3 + rng() * 0.7) * maxHop
    const m = 40
    return {
      x: Math.max(m, Math.min(bounds.w - m, P.x + Math.cos(ang) * dist)),
      y: Math.max(m, Math.min(bounds.h - m, P.y + Math.sin(ang) * dist)),
    }
  }

  return {
    vecFromAngleDeg,
    cubicEaseInOut,
    lerpHeadingDeg,
    computeRig,
    footStepTarget,
    pickWanderTarget,
    lerp,
    norm,
    add,
    sub,
    mul,
    len,
  }
})
