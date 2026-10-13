const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write } = require('./support.cjs')

test('a customer cannot introduce a permanent external storefront redirect', async t => {
  const config = await load('src/payload/payload.config').default
  const redirects = config.collections.find(collection => collection.slug === 'redirects')
  if (!redirects) return // Removing the redirect feature also closes the path.
  const marker = { from: '/marker', to: { type: 'custom', url: 'https://outside.invalid/marker' } }
  const result = await write(redirects, 'create', request(), marker)
  if (result.refused) return
  t.mock.method(globalThis, 'fetch', async () => ({ json: async () => ({ docs: [result.doc] }) }))
  const rules = await load('redirects.js')()
  assert.equal(rules.some(rule => rule.source === '/marker' && rule.permanent &&
    new URL(rule.destination, 'http://store.invalid').origin !== 'http://store.invalid'), false,
  'customer-created data must not become a permanent external redirect')
})
