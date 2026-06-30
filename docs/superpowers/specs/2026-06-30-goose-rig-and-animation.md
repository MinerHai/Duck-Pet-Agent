# Goose Rig, Animation & Movement — faithful reference + fix plan

Deep analysis of `arkangel-dev/desktop-goose-source` (`TheGoose.cs`, `Easings.cs`) to fix
DuckClaude's UI/animation/behavior. The goose is **drawn procedurally every frame** (no
sprite): thick round-capped "capsule" lines + circles. Our emoji 🦆 + bob must be replaced
by this rig.

## 1. The rig geometry (`UpdateRig`, TheGoose.cs:530-550)

Let `P` = position (a point near the feet). Unit vectors: `up = (0,-1)` (screen y is down),
`f = unitVector(direction)` (facing/travel direction), `perp = unitVector(direction+90°)`,
squash `b = (1.3, 0.4)` (perspective squash for eye spacing).

Neck morph driven by `neckLerpPercent` ∈ [0,1] (0 idle → 1 running):
- `num4 = lerp(20, 10, neckLerp)` — neck **height** (tall when idle, low when running)
- `num5 = lerp(3, 16, neckLerp)` — neck **forward reach** (small idle, long when running)

Points:
```
underbodyCenter = P + up*9
bodyCenter      = P + up*14
neckBase        = bodyCenter + f*15
neckHeadPoint   = neckBase + f*num5 + up*num4
head1End        = neckHeadPoint + f*3 - up*1
head2End        = head1End + f*5
beakTip         = head2End + f*3
```

## 2. Render order & the two-pass capsule trick (`Render`, 553-609)

All lines use **round caps** (`lineCap='round'`) → capsule limbs. Drawn back-to-front:

1. **Footmarks** — SaddleBrown filled circles; radius `lerp(3,0, clamp(now-(t+8.5),0,1))`
   (each print holds 8.5s, then fades 3→0 over 1s).
2. **Feet** — 2 Orange filled circles, radius **4**, at `lFootPos`, `rFootPos`.
3. **Shadow** — dithered dark ellipse 20×15 centered at `P` (use ~`rgba(80,80,80,0.35)`).
4. **Outline pass (LightGray)** — widths: body **24**, neck **15**, head1 **17**, head2 **12**,
   underbody **15**.
5. **Fill pass (White, thinner, over the outline → leaves a gray edge)** — body **22**,
   neck **13**, head1 **15**, head2 **10**.
6. **Beak (Orange, width 9)** — `head2End → beakTip`.
7. **Eyes** — 2 Black filled circles radius **2** at
   `neckHeadPoint + up*3 ± (perp*b)*5 + f*5`.

Limb segments (each drawn in both passes):
```
body      : line  (bodyCenter + f*11)      → (bodyCenter - f*11)
underbody : line  (underbodyCenter + f*7)  → (underbodyCenter - f*7)   [outline pass only]
neck      : line  neckBase                 → neckHeadPoint
head1     : line  neckHeadPoint            → head1End
head2     : line  head1End                 → head2End
```

**Colors** — goose: White body, LightGray edge, Orange beak+feet, Black eyes, SaddleBrown
prints, DarkGray shadow. **Duck theme (DuckClaude):** body `#FFD93D` (golden), edge
`#E0A92A`, beak+feet `#FF8C00`, eyes black, prints SaddleBrown, shadow dark.

## 3. Gait — 2-foot procedural walk (`SolveFeet`/`GetFootHome`, 446-515)

Foot homes track the body: `homeL = P`, `homeR = P + perp*6`. One foot moves at a time:
- If both feet idle and a foot is **> 5px** from its home → start its step.
- Step animates `origin → home + stepDir*0.4*5` (overshoot **+2px**) over `stepTime`
  (**0.2s** walk/run, **0.1s** charge) using **CubicEaseInOut**.
- On landing: play "pat"; if within a mud window, drop a footmark.

`CubicEaseInOut(p)` = `p<0.5 ? 4p³ : 0.5*(2p-2)³ + 1`.

This lag-then-step is what reads as *walking*. Our duck slides with no feet — the single
biggest "wrong" tell.

## 4. Movement physics & heading (`Tick`, 74-97; `SetSpeed`, 49-71)

Speed tiers: **Walk** speed 80 / accel 1300, **Run** 200 / 1300, **Charge** 400 / 2300.
Per frame (original dt = 1/120 fixed — **we must use real delta-time in seconds**):
```
targetDir = normalize(targetPos - P)
direction = angleLerp(direction, targetDir, 0.25)        // smooth turn, NOT instant flip
if |velocity| > speed: velocity = normalize(velocity)*speed
velocity += normalize(targetPos - P) * accel * dt
P += velocity * dt
neckLerp = lerp(neckLerp, running?1:0, 0.075)            // running = speed>=200 or override
```

## 5. Wander feel (`RunWander`, 100-133)

Walk to a target; **reach when <20px** → **pause 1–2s** (velocity 0) → pick new target a
random `1–6 × speed` px away. Short legs + frequent pauses = the ambling feel. Ours picks a
new target every 2.5s at constant speed with no pause → robotic.

## 6. Gap vs current DuckClaude & fix plan

| Aspect | Goose (correct) | Ours now | Fix |
|---|---|---|---|
| Body | procedural capsule rig | emoji 🦆 | draw the rig |
| Turning | heading angle-lerp 0.25 | instant `scale(-1,1)` | angle-lerp |
| Walk | 2-foot gait, step+overshoot | slide | port SolveFeet |
| Neck | lerp tall↔low+forward | none | neckLerp morph |
| Speed | Walk/Run/Charge tiers | constant 2.2 | tiers + accel |
| Wander | legs + 1–2s pauses | every 2.5s, no pause | port RunWander |
| Timestep | (fixed 1/120) | per-frame add | real delta-time |

**Plan:** put the pure math in `src/shared/rig.js` (UMD: `module.exports` for `node:test`
**and** `window.Rig` for the renderer) — `computeRig`, `cubicEaseInOut`, `vecFromAngleDeg`,
`angleLerpDeg`, `stepFoot`, wander-target picker — and **TDD it against the exact formulas
above**. Then rewrite `overlay.js` to: integrate movement with real `dt`, run the gait,
morph the neck, and render the duck-themed two-pass rig (keeping HONK!/⌨️/confetti overlays
and the existing IPC: state/cursor/settings/gift/mud). State→speed map: IDLE/WORKING = Walk,
NEEDS_INPUT = Charge toward the cursor, MISCHIEF-mud = Run. `main.js`, the state machine,
hooks, settings, and antics are unchanged.
