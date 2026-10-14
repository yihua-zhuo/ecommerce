const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const h = require('./harness.cjs')
test('cross-site administrator navigation cannot replace storefront content', async () => {
  process.env.NODE_ENV = 'production'
  const config = await h.config()
  const { req, res, effects } = h.request({ ...h.user(), roles: ['admin'] })
  req.method = 'GET'
  req.url = req.originalUrl = '/api/seed'
  req.headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  req.payload.config = config
  const original = fs.rmdirSync
  fs.rmdirSync = () => { effects.push('media removal') }
  try {
    for (const route of config.endpoints || []) {
      if (route.path === '/seed' && route.method.toLowerCase() === 'get') await h.invoke(route.handler, req, res)
    }
    assert.equal(effects.length, 0, 'Cross-site GET must not mutate storefront data')
  } finally { fs.rmdirSync = original }
})
