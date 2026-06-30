'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
// Only the pure helpers are exercised here (no Electron runtime needed).
const { escapeHtml, htmlFor } = require('../src/main/gift-window')

test('escapeHtml neutralizes HTML-significant characters', () => {
  assert.strictEqual(escapeHtml('<b>&"hi"'), '&lt;b&gt;&amp;&quot;hi&quot;')
})

test('htmlFor(note) escapes user-droppable note text', () => {
  const html = htmlFor({ type: 'note', text: '<script>alert(1)</script>' })
  assert.ok(!html.includes('<script>'), 'note text must be escaped')
  assert.ok(html.includes('&lt;script&gt;'))
})

test('htmlFor(meme) embeds the image src', () => {
  const html = htmlFor({ type: 'meme', src: 'file:///x/y.png' })
  assert.ok(html.includes('file:///x/y.png'))
  assert.ok(html.includes('<img'))
})
