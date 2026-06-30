'use strict'
const fs = require('node:fs')
const path = require('node:path')

const DEFAULTS = Object.freeze({
  wanderMinSeconds: 20,
  wanderMaxSeconds: 40,
  duckSize: 54,
  duckCount: 4, // size of the flock (1–8)
  hungerMinutes: 30, // a medium duck empties its hunger bar in this long (bigger ducks last longer)
  opacity: 1.0,
  soundEnabled: true,
  honkVolume: 1.0,
  coop: Object.freeze({
    enabled: false, // draw the fenced pen + trough (toggled from the menu)
    x: null, // dragged top-left position (null = default bottom-centre)
    y: null,
  }),
  chaos: Object.freeze({
    enabled: false,
    footprints: true,
    bringMemes: true,
    grabCursor: true,
    nudgeWindows: true,
    randomAttacks: false,
  }),
  hooksInstalled: true,
})

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(over || {})) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k]
  }
  return out
}

function load(file) {
  let saved = {}
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    saved = {}
  }
  return deepMerge(DEFAULTS, saved)
}

function save(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings, null, 2))
}

module.exports = { DEFAULTS, load, save, deepMerge }
