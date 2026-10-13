const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

test('Compose does not publish unauthenticated MongoDB to the host network', () => {
  const compose = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../docker-compose.yml'), 'utf8'))
  const exposed = []
  for (const [name, service] of Object.entries(compose.services || {})) {
    if (!/(^|\/)mongo(?::|$)/.test(service.image || '')) continue
    const environment = Array.isArray(service.environment)
      ? Object.fromEntries(service.environment.map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)] }))
      : service.environment || {}
    const command = Array.isArray(service.command) ? service.command.join(' ') : service.command || ''
    const authenticated = /(?:^|\s)--auth(?:\s|$)/.test(command) ||
      Boolean((environment.MONGO_INITDB_ROOT_USERNAME || environment.MONGO_INITDB_ROOT_USERNAME_FILE) &&
        (environment.MONGO_INITDB_ROOT_PASSWORD || environment.MONGO_INITDB_ROOT_PASSWORD_FILE))
    for (const port of service.ports || []) {
      const loopback = typeof port === 'object' ? ['127.0.0.1', '::1'].includes(port.host_ip)
        : /^(127\.0\.0\.1|\[::1\]):/.test(String(port))
      if (!loopback && !authenticated) exposed.push(name)
    }
  }
  assert.deepEqual(exposed, [], 'MongoDB must be private, loopback-only, or authenticated')
})
