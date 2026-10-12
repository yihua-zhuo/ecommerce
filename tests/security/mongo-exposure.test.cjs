const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

test('published MongoDB requires authentication or a private binding', () => {
  const compose = yaml.load(fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8'))
  for (const service of Object.values(compose.services || {})) {
    if (!/^mongo(?:db)?(?::|@|$)/.test(service.image || '')) continue
    const exposed = service.network_mode === 'host' || (service.ports || []).some(port => {
      if (typeof port === 'object') return !['127.0.0.1', '::1'].includes(port.host_ip)
      const binding = String(port)
      return !/^(127\.0\.0\.1:|\[::1\]:)/.test(binding)
    })
    const environment = Array.isArray(service.environment)
      ? Object.fromEntries(service.environment.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)] }))
      : service.environment || {}
    const command = [service.entrypoint, service.command].flat().filter(Boolean).join(' ')
    const auth = !/(?:^|\s)--noauth(?:\s|$)/.test(command) && (
      /(?:^|\s)--auth(?:\s|$)/.test(command) ||
      Boolean((environment.MONGO_INITDB_ROOT_USERNAME || environment.MONGO_INITDB_ROOT_USERNAME_FILE) &&
        (environment.MONGO_INITDB_ROOT_PASSWORD || environment.MONGO_INITDB_ROOT_PASSWORD_FILE)))
    assert.ok(!exposed || auth, 'MongoDB must not expose an unauthenticated listener beyond loopback')
  }
})
