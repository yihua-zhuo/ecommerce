const test = require('node:test')
const assert = require('node:assert/strict')
require('./support.cjs')
const Module = require('node:module')

test('preview does not redirect an authenticated browser to another origin', async t => {
  process.env.NEXT_PUBLIC_SERVER_URL = 'https://store.example.invalid'
  process.env.PAYLOAD_PUBLIC_SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL
  process.env.NEXT_PRIVATE_DRAFT_SECRET = 'fixture-secret'
  const destinations = []
  const load = Module._load
  // These are Next's request-context boundaries, not application functions.
  t.mock.method(Module, '_load', function (name, ...args) {
    if (name === 'next/headers') return { draftMode: () => ({ enable() {}, disable() {} }) }
    if (name === 'next/navigation') return { redirect: destination => { destinations.push(destination) } }
    return load.call(this, name, ...args)
  })
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    user: { id: '000000000000000000000001', roles: ['admin'] },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const { GET } = require('../../src/app/api/preview/route')
  const target = 'https://elsewhere.example.invalid/marker'
  const req = new Request(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/preview?secret=fixture-secret&url=${encodeURIComponent(target)}`)
  req.cookies = { get: () => ({ value: 'fixture-session' }) }
  const response = await GET(req)
  if (response?.headers?.get('location')) destinations.push(response.headers.get('location'))
  assert.equal(destinations.some(destination => new URL(destination, process.env.NEXT_PUBLIC_SERVER_URL).origin !== process.env.NEXT_PUBLIC_SERVER_URL), false,
    'A valid preview session and secret must not authorize an off-origin redirect')
})
