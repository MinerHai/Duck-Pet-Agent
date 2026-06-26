'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { createListener } = require('../src/main/status-listener')

async function withListener(onEvent, fn) {
  const listener = createListener({ port: 0, host: '127.0.0.1', onEvent })
  const port = await listener.listen()
  try {
    await fn(port)
  } finally {
    await listener.close()
  }
}

test('POST /hook parses event name + payload and calls onEvent, returns 204', async () => {
  const calls = []
  await withListener((name, payload) => calls.push([name, payload]), async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'Stop', session_id: 'abc' }),
    })
    assert.strictEqual(res.status, 204)
  })
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0][0], 'Stop')
  assert.strictEqual(calls[0][1].session_id, 'abc')
})

test('malformed JSON does not throw; onEvent not called; returns 204', async () => {
  const calls = []
  await withListener((n) => calls.push(n), async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: '{not json' })
    assert.strictEqual(res.status, 204)
  })
  assert.strictEqual(calls.length, 0)
})

test('non-hook routes return 404', async () => {
  await withListener(() => {}, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/other`)
    assert.strictEqual(res.status, 404)
  })
})
