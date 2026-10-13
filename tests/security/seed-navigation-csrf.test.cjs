const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { load, request, response, admin } = require('./support.cjs')

test('cross-site link navigation cannot seed the store using an administrator session', async t => {
  const config = await load('src/payload/payload.config').default
  const endpoint = config.endpoints.find(entry =>
    entry.path === '/seed' && entry.method.toLowerCase() === 'get')
  if (!endpoint) return // Removing GET is a valid defense against link navigation.

  const removals = []
  t.mock.method(fs, 'rmdirSync', (...args) => { removals.push(args) })
  t.mock.method(fs, 'rmSync', (...args) => { removals.push(args) })
  const req = request(admin)
  req.method = 'GET'
  req.url = '/api/seed'
  req.originalUrl = req.url
  req.headers = {
    cookie: 'payload-token=administrator-session-marker',
    referer: 'https://unrelated.invalid/',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-user': '?1',
  }
  req.get = req.header = name => req.headers[name.toLowerCase()]
  const res = response()
  await endpoint.handler(req, res)
  assert.deepEqual(req.effects, [],
    'a GET navigation with only an admin session must not replace catalog or storefront records')
  assert.deepEqual(removals, [],
    'a GET navigation with only an admin session must not remove media files')
})
