'use strict'
const fs = require('node:fs')

// Map a Claude Code tool name to a clear human verb (agentpet's ActivityFormatter idea,
// but plain verbs for clarity rather than themed).
const CATEGORIES = [
  [/^(read|view|cat)$/i, 'Reading'],
  [/(grep|glob|search|find|^ls$|list|fetch)/i, 'Searching'],
  [/(bash|shell|terminal|^run$|exec|command|^zsh$|^sh$)/i, 'Running'],
  [/(edit|write|create|patch|delete|update|notebook)/i, 'Editing'],
  [/(task|agent|dispatch)/i, 'Delegating'],
  [/skill/i, 'Using a skill'],
]

const basename = (p) => String(p).split('/').filter(Boolean).pop() || ''

function fileHint(verb, input) {
  if (!input || typeof input !== 'object') return ''
  if (input.file_path || input.path) return basename(input.file_path || input.path)
  if (verb === 'Running' && input.command) return String(input.command).trim().split(/\s+/)[0]
  if (verb === 'Searching' && input.pattern) return `"${input.pattern}"`
  return ''
}

// formatActivity('Edit', {file_path}) -> 'Editing overlay.js…'
function formatActivity(toolName, toolInput) {
  if (!toolName) return 'Working…'
  const match = CATEGORIES.find(([re]) => re.test(toolName))
  const verb = match ? match[1] : 'Working'
  const hint = fileHint(verb, toolInput)
  return hint ? `${verb} ${hint}…` : `${verb}…`
}

const Q_OPENERS = [
  'which', 'what', 'how', 'why', 'should i', 'should we', 'do you', 'do i',
  'want me to', 'shall i', 'would you', 'can you', 'could you', 'are you', 'is it',
]

// Claude emits `Stop` for both "finished" and "asking a question". Detect the latter so we
// can show NEEDS_INPUT instead of DONE (agentpet's QuestionDetector idea).
function looksLikeQuestion(text) {
  if (!text) return false
  const sentences = String(text).trim().split(/(?<=[.!?])\s+/).filter(Boolean)
  if (!sentences.length) return false
  let last = sentences[sentences.length - 1].trim().toLowerCase()
  if (/^(let me know|feel free|lmk)\b/.test(last) && sentences.length > 1) {
    last = sentences[sentences.length - 2].trim().toLowerCase()
  }
  if (last.endsWith('?')) return true
  return Q_OPENERS.some((s) => last.startsWith(s))
}

// Best-effort: read the tail of a Claude transcript (JSONL) and return the last assistant
// text. Returns '' on any problem (so the caller safely treats it as "not a question").
function lastAssistantText(transcriptPath) {
  try {
    const fd = fs.openSync(transcriptPath, 'r')
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, 64 * 1024)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj
      try { obj = JSON.parse(lines[i]) } catch { continue }
      const role = obj.role || (obj.message && obj.message.role) || obj.type
      if (role !== 'assistant') continue
      const content = (obj.message && obj.message.content) || obj.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        const txt = content.filter((c) => c && c.type === 'text' && c.text).map((c) => c.text).join(' ')
        if (txt) return txt
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

module.exports = { formatActivity, looksLikeQuestion, lastAssistantText }
