'use strict'
const fs = require('node:fs')
const path = require('node:path')

const SEED_NOTES = ['HONK!', "I'm watching your code 👀", 'Did you commit yet?']

function listFiles(dir, exts) {
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => exts.includes(path.extname(n).toLowerCase()))
    .map((n) => path.join(dir, n))
}

function ensureFolders(baseDir) {
  const memesDir = path.join(baseDir, 'Memes')
  const notesDir = path.join(baseDir, 'Notes')
  fs.mkdirSync(memesDir, { recursive: true })
  fs.mkdirSync(notesDir, { recursive: true })
  if (listFiles(notesDir, ['.txt']).length === 0) {
    SEED_NOTES.forEach((text, i) =>
      fs.writeFileSync(path.join(notesDir, `note${i + 1}.txt`), text),
    )
  }
  return { memesDir, notesDir }
}

function pickRandom(list, rng = Math.random) {
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

module.exports = { ensureFolders, listFiles, pickRandom, SEED_NOTES }
