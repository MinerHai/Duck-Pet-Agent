'use strict'
const http = require('node:http')

function createListener({ port, host = '127.0.0.1', onEvent }) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        let json = null
        try {
          json = JSON.parse(body || '{}')
        } catch {
          json = null
        }
        if (json && json.hook_event_name) onEvent(json.hook_event_name, json)
        res.writeHead(204).end()
      })
    } else {
      res.writeHead(404).end()
    }
  })

  return {
    server,
    listen() {
      return new Promise((resolve) =>
        server.listen(port, host, () => resolve(server.address().port)),
      )
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}

module.exports = { createListener }
