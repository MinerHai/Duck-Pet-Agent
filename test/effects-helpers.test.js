'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { buildWindowNudgeScript } = require('../src/main/effects')

test('buildWindowNudgeScript embeds the delta and targets the frontmost process', () => {
  const s = buildWindowNudgeScript(120, 80)
  assert.match(s, /System Events/)
  assert.match(s, /frontmost is true/)
  assert.match(s, /\{x \+ 120, y \+ 80\}/)
})

test('buildWindowNudgeScript supports negative deltas', () => {
  const s = buildWindowNudgeScript(-30, -10)
  assert.match(s, /\{x \+ -30, y \+ -10\}/)
})
