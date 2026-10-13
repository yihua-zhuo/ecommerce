const { test } = require('node:test')
const assert = require('node:assert/strict')
const { config, context, response } = require('./support.cjs')

test('a customer cannot invoke storefront reseeding', async t => {
  const endpoint = config.endpoints?.find(e => e.path === '/seed' && e.method === 'get')
  if (!endpoint) return // Removing the production route is a valid remediation.
  const fs = require('node:fs')
  const realExists = fs.existsSync
  t.mock.method(fs, 'existsSync', path => String(path).endsWith('/media') ? false : realExists(path))
  const filesystemWrites = []
  t.mock.method(fs, 'rmdirSync', (...args) => filesystemWrites.push(args))
  t.mock.method(fs, 'rmSync', (...args) => filesystemWrites.push(args))
  const ctx = context()
  const res = response()
  await endpoint.handler({ ...ctx.req, method: 'GET' }, res)
  assert.deepEqual(ctx.effects, [], 'customer seed request performed privileged storage writes')
  assert.deepEqual(filesystemWrites, [], 'customer seed request removed media')
  assert.ok([401, 403, 404, 405].includes(res.statusCode), 'customer seed request was not refused')
})
