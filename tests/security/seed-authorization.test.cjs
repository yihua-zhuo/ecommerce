const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { load, request, response } = require('./support.cjs')

test('a customer cannot run destructive store seeding', async t => {
  const config = await load('src/payload/payload.config').default
  const endpoint = config.endpoints.find(item => item.path === '/seed')
  if (!endpoint) return
  const req = request()
  const res = response()
  // Intercept filesystem deletion at the standard-library boundary as well.
  const removals = []
  t.mock.method(fs, 'rmdirSync', (...args) => removals.push(args))
  t.mock.method(fs, 'rmSync', (...args) => removals.push(args))
  await endpoint.handler(req, res)
  assert.deepEqual(req.effects, [], 'customer request must not delete, replace, or reseed store records')
  assert.deepEqual(removals, [], 'customer request must not clear media storage')
  assert.ok([401, 403, 404, 405].includes(res.statusCode), 'seed request must be refused')
})
