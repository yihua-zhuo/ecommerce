const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const YAML = require('yaml')

test('Compose does not publish an unauthenticated MongoDB port', () => {
  const compose = YAML.parse(fs.readFileSync('docker-compose.yml', 'utf8'))
  for (const service of Object.values(compose.services)) {
    if (!/^mongo(?::|@|$)/.test(service.image || '')) continue
    const published = (service.ports || []).some(port => {
      if (typeof port === 'object') return Number(port.target) === 27017
      return String(port).split(':').pop().split('/')[0] === '27017'
    }) || service.network_mode === 'host'
    const env = Array.isArray(service.environment)
      ? Object.fromEntries(service.environment.map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)] }))
      : service.environment || {}
    const command = Array.isArray(service.command) ? service.command.join(' ') : service.command || ''
    const authenticated = (!!env.MONGO_INITDB_ROOT_USERNAME && !!env.MONGO_INITDB_ROOT_PASSWORD) || /(?:^|\s)--auth(?:\s|$)/.test(command)
    assert.ok(!published || authenticated, 'MongoDB publishes its database port without authentication')
  }
})
