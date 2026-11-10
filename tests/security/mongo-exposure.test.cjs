const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')
test('Compose does not publish an unauthenticated MongoDB listener', () => {
  const compose = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../docker-compose.yml'), 'utf8'))
  for (const service of Object.values(compose.services || {})) {
    if (!/^mongo(?::|@|$)/.test(service.image || '')) continue
    const env = Array.isArray(service.environment) ? Object.fromEntries(service.environment.map(s => s.split(/=(.*)/s))) : service.environment || {}
    const command = Array.isArray(service.command) ? service.command.join(' ') : service.command || ''
    const auth = /(?:^|\s)--auth(?:\s|$)/.test(command) || Boolean(env.MONGO_INITDB_ROOT_USERNAME && env.MONGO_INITDB_ROOT_PASSWORD)
    const exposed = (service.ports || []).some(port => {
      const host = typeof port === 'object' ? port.host_ip : String(port).split(':').slice(0, -2).join(':')
      return !['127.0.0.1', '::1', '[::1]'].includes(host)
    })
    assert.ok(!exposed || auth, 'MongoDB must not publish a host port without authentication')
  }
})
