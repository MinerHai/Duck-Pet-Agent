'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { load, save, DEFAULTS } = require('../src/main/settings-store')

function tmp() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'duckset-')), 's.json')
}

test('load() returns DEFAULTS when file is missing', () => {
  assert.deepStrictEqual(load(tmp()), DEFAULTS)
})

test('load() deep-merges saved partial over defaults', () => {
  const p = tmp()
  fs.writeFileSync(p, JSON.stringify({ duckSize: 80, chaos: { enabled: true } }))
  const s = load(p)
  assert.strictEqual(s.duckSize, 80)
  assert.strictEqual(s.chaos.enabled, true)
  assert.strictEqual(s.chaos.footprints, true) // default preserved
  assert.strictEqual(s.wanderMinSeconds, 20) // untouched default
})

test('save() then load() round-trips', () => {
  const p = tmp()
  const next = { ...DEFAULTS, honkVolume: 0.3, chaos: { ...DEFAULTS.chaos, nudgeWindows: false } }
  save(p, next)
  assert.deepStrictEqual(load(p), next)
})
