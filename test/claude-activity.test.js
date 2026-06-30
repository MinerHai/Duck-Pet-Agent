'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { formatActivity, looksLikeQuestion } = require('../src/main/claude-activity')

test('formatActivity maps tool + file to a clear verb phrase', () => {
  assert.strictEqual(formatActivity('Edit', { file_path: '/a/b/overlay.js' }), 'Editing overlay.js…')
  assert.strictEqual(formatActivity('Read', { file_path: '/x/README.md' }), 'Reading README.md…')
  assert.strictEqual(formatActivity('Write', { path: '/p/main.js' }), 'Editing main.js…')
})

test('formatActivity: Bash uses the first command word', () => {
  assert.strictEqual(formatActivity('Bash', { command: 'npm test' }), 'Running npm…')
})

test('formatActivity: search tools, with/without pattern', () => {
  assert.strictEqual(formatActivity('Grep', { pattern: 'foo' }), 'Searching "foo"…')
  assert.strictEqual(formatActivity('Glob', {}), 'Searching…')
})

test('formatActivity: task/skill/unknown/none', () => {
  assert.strictEqual(formatActivity('Task', {}), 'Delegating…')
  assert.strictEqual(formatActivity('Skill', {}), 'Using a skill…')
  assert.strictEqual(formatActivity('Frobnicate', {}), 'Working…')
  assert.strictEqual(formatActivity(undefined, undefined), 'Working…')
})

test('looksLikeQuestion: trailing ? or question opener', () => {
  assert.strictEqual(looksLikeQuestion('Which option do you prefer?'), true)
  assert.strictEqual(looksLikeQuestion('Should I proceed'), true)
  assert.strictEqual(looksLikeQuestion('Want me to continue with the refactor'), true)
})

test('looksLikeQuestion: statements are not questions', () => {
  assert.strictEqual(looksLikeQuestion('I finished the task.'), false)
  assert.strictEqual(looksLikeQuestion(''), false)
})

test('looksLikeQuestion: ignores a trailing "let me know" follow-up', () => {
  assert.strictEqual(looksLikeQuestion('Done. Let me know if you need anything.'), false)
  assert.strictEqual(looksLikeQuestion('Which file should I edit? Let me know if unsure.'), true)
})
