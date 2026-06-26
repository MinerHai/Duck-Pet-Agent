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

function group(url) {
  return { matcher: '*', hooks: [{ type: 'http', url, async: true }] }
}

function installHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  cfg.hooks = cfg.hooks || {}
  for (const ev of HOOK_EVENTS) {
    cfg.hooks[ev] = cfg.hooks[ev] || []
    const exists = cfg.hooks[ev].some((g) => (g.hooks || []).some((h) => h.url === url))
    if (!exists) cfg.hooks[ev].push(group(url))
  }
  writeSettings(settingsPath, cfg)
}

function uninstallHooks({ settingsPath = defaultSettingsPath(), url }) {
  const cfg = readSettings(settingsPath)
  if (!cfg.hooks) return
  for (const ev of HOOK_EVENTS) {
    if (!Array.isArray(cfg.hooks[ev])) continue
    cfg.hooks[ev] = cfg.hooks[ev].filter((g) => !(g.hooks || []).some((h) => h.url === url))
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev]
  }
  writeSettings(settingsPath, cfg)
}

module.exports = { installHooks, uninstallHooks, HOOK_EVENTS, defaultSettingsPath }
