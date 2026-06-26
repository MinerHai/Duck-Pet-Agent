'use strict'
// Spike 0.4 — a Claude Code event (via curl) reaches a local HTTP server.
const http = require('node:http')
const { PORT, HOST } = require('../src/config')

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        console.log('HOOK RECEIVED:', body || '(empty)')
        res.writeHead(204).end()
      })
    } else {
      res.writeHead(404).end()
    }
  })
  .listen(PORT, HOST, () => console.log(`probe listening on ${HOST}:${PORT}`))
