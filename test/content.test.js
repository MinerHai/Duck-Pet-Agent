'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureFolders, listFiles, pickRandom } = require('../src/main/content')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'duckcontent-'))
}

test('ensureFolders creates Memes and Notes and seeds a starter note', () => {
  const base = tmpDir()
  const { memesDir, notesDir } = ensureFolders(base)
  assert.ok(fs.existsSync(memesDir))
  assert.ok(fs.existsSync(notesDir))
  assert.ok(listFiles(notesDir, ['.txt']).length >= 1, 'expected a seeded note')
})

test('listFiles filters by extension', () => {
  const d = tmpDir()
  fs.writeFileSync(path.join(d, 'a.png'), 'x')
  fs.writeFileSync(path.join(d, 'b.txt'), 'y')
  assert.deepStrictEqual(listFiles(d, ['.png']).map((f) => path.basename(f)), ['a.png'])
})

test('pickRandom is deterministic under an injected rng', () => {
  assert.strictEqual(pickRandom(['a', 'b', 'c'], () => 0), 'a')
  assert.strictEqual(pickRandom(['a', 'b', 'c'], () => 0.99), 'c')
  assert.strictEqual(pickRandom([], () => 0), null)
})
