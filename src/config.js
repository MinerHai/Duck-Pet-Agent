'use strict'

module.exports = {
  HOST: '127.0.0.1',
  PORT: 4242,
  hookUrl() {
    return `http://${this.HOST}:${this.PORT}/hook`
  },
}
