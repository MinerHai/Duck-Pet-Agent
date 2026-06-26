'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOOK_EVENTS = ['UserPromptSubmit', 'PreToolUse', 'Notification', 'PermissionRequest', 'Stop']

function defaultSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

function readSettings(settingsPath) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(settingsPath, cfg) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2))
}

// Claude Code only supports `type: "command"` hooks (verified against the live, working
// AgentPet hooks in ~/.claude/settings.json and the official docs). The command receives
// the event JSON on stdin (including `hook_event_name`); we pipe it verbatim to our local
// listener with curl. `--data-binary @-` forwards stdin without altering the JSON.
function hookCommand(url) {
  return `curl -s -X POST -H 'Content-Type: application/json' --data-binary @- ${url}`
}

function group(url) {
  return { hooks: [{ type: 'command', command: hookCommand(url) }] }
}

// Identify *our* hook (for idempotency + clean uninstall) by the listener URL embedded in
// the command — never matches another tool's hook (e.g. AgentPet's binary path).
function isOurs(g, url) {
  return (g.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes(url))
}

function installHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  cfg.hooks = cfg.hooks || {}
  for (const ev of HOOK_EVENTS) {
    cfg.hooks[ev] = cfg.hooks[ev] || []
    if (!cfg.hooks[ev].some((g) => isOurs(g, url))) cfg.hooks[ev].push(group(url))
  }
  writeSettings(settingsPath, cfg)
}

function uninstallHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  if (!cfg.hooks) return
  for (const ev of HOOK_EVENTS) {
    if (!Array.isArray(cfg.hooks[ev])) continue
    cfg.hooks[ev] = cfg.hooks[ev].filter((g) => !isOurs(g, url))
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev]
  }
  writeSettings(settingsPath, cfg)
}

module.exports = { installHooks, uninstallHooks, HOOK_EVENTS, defaultSettingsPath }
