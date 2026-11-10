const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
test('public registration cannot claim an existing Stripe customer', async () => {
  const config = await h.config()
  const users = config.collections.find(c => c.slug === 'users')
  const bindings = []
  for (const supplied of [true, false]) {
    const { req } = h.request(null)
    req.payload.find = async () => ({ docs: [{ id: 'existing_user' }], totalDocs: 1 })
    const data = { email: 'marker@example.invalid', name: 'Marker', ...(supplied ? { stripeCustomerID: 'cus_other' } : {}) }
    try { bindings.push((await h.create(users, req, data))?.stripeCustomerID) }
    catch (error) { if (![400, 401, 403, 409, 422].includes(error.status || error.statusCode)) throw error }
  }
  assert.ok(!bindings.includes('cus_other'), 'Registration must not bind another Stripe customer by ID or unverified email')
})
