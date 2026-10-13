const { test } = require('node:test')
const assert = require('node:assert/strict')
require('./support.cjs')
const { GET } = require('../../src/app/api/preview/route.ts')

test('authenticated preview cannot redirect to another origin', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ user: { id: 'editor', roles: ['admin'] } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }))
  for (const destination of ['https://other.example/marker', '//other.example/marker']) {
    const url = new URL('https://store.example/api/preview')
    url.searchParams.set('url', destination)
    url.searchParams.set('secret', process.env.NEXT_PRIVATE_DRAFT_SECRET)
    const request = new Request(url)
    request.cookies = { get: () => ({ value: 'valid-marker' }) }
    let target
    let response
    try { response = await GET(request) } catch (error) {
      if (!error.destination) throw error
      target = error.destination
    }
    target ||= response?.headers?.get('location')
    assert.ok(target ? new URL(target, 'https://store.example').origin === 'https://store.example'
      : response?.status >= 400, `preview redirected outside the storefront: ${target}`)
  }
})
