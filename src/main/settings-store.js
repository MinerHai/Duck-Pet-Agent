'use strict'
const fs = require('node:fs')
const path = require('node:path')

const DEFAULTS = Object.freeze({
  wanderMinSeconds: 20,
  wanderMaxSeconds: 40,
  duckSize: 54,
  opacity: 1.0,
  soundEnabled: true,
  honkVolume: 1.0,
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
