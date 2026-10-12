const test = require('node:test')
const assert = require('node:assert/strict')
const { logger } = require('./support.cjs')
const { revalidate } = require('../../src/payload/utilities/revalidate')

test('revalidation never puts the authorization secret in a request URL', async t => {
  process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://store.example.invalid'
  process.env.REVALIDATION_KEY = 'revalidation-secret-marker'
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    requests.push(new Request(input, options))
    return new Response('{}', { status: 200 })
  })
  await revalidate({ collection: 'products', slug: 'fixture', payload: { logger } })
  assert.ok(requests.length > 0, 'The fixture must exercise a revalidation request')
  for (const request of requests) {
    assert.equal(decodeURIComponent(request.url).includes(process.env.REVALIDATION_KEY), false,
      'Revalidation credentials must not appear in URLs retained by request logs')
  }
})
