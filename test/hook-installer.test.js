'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { installHooks, uninstallHooks, HOOK_EVENTS } = require('../src/main/hook-installer')

function tmpSettings(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-'))
  const p = path.join(dir, 'settings.json')
  if (initial !== undefined) fs.writeFileSync(p, JSON.stringify(initial))
  return p
}

const URL = 'http://127.0.0.1:4242/hook'

test('installHooks adds a command hook (curl) for every DuckClaude event', () => {
  const p = tmpSettings({})
  installHooks({ settingsPath: p, url: URL })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  for (const ev of HOOK_EVENTS) {
    const groups = cfg.hooks[ev]
    assert.ok(Array.isArray(groups), `missing ${ev}`)
    const ours = groups.some((g) =>
      g.hooks.some((h) => h.type === 'command' && h.command.includes(URL)),
    )
    assert.ok(ours, `no DuckClaude command hook in ${ev}`)
  }
})

test('installHooks is idempotent (no duplicates on second run)', () => {
  const p = tmpSettings({})
  installHooks({ settingsPath: p, url: URL })
  installHooks({ settingsPath: p, url: URL })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const count = cfg.hooks.Stop.filter((g) => g.hooks.some((h) => (h.command || '').includes(URL))).length
  assert.strictEqual(count, 1)
})

test('installHooks preserves existing unrelated hooks (e.g. AgentPet)', () => {
  const p = tmpSettings({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'agentpet-hook' }] }] } })
  installHooks({ settingsPath: p, url: URL })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const hasAgentPet = cfg.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'agentpet-hook'))
  assert.ok(hasAgentPet, 'AgentPet hook was clobbered')
})

test('uninstallHooks removes only DuckClaude hooks, keeps others', () => {
  const p = tmpSettings({ hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'agentpet-hook' }] }] } })
  installHooks({ settingsPath: p, url: URL })
  uninstallHooks({ settingsPath: p, url: URL })
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
  const ours = cfg.hooks.Stop.some((g) => g.hooks.some((h) => (h.command || '').includes(URL)))
  const hasAgentPet = cfg.hooks.Stop.some((g) => g.hooks.some((h) => h.command === 'agentpet-hook'))
  assert.strictEqual(ours, false)
  assert.ok(hasAgentPet)
})
