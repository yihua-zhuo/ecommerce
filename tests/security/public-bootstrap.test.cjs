const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
test('anonymous first registration does not acquire administrator privileges', async () => {
  const config = await h.config()
  const users = config.collections.find(c => c.slug === 'users')
  const { req } = h.request(null)
  let created
  try { created = await h.create(users, req, { email: 'marker@example.invalid', name: 'Marker' }) }
  catch (error) { if (![400, 401, 403, 409, 422].includes(error.status || error.statusCode)) throw error }
  assert.ok(!created?.roles?.includes('admin'), 'Anonymous first registrant must not become an administrator')
})
