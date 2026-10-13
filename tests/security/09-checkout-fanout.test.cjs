const { test } = require('node:test')
const assert = require('node:assert/strict')
const { config, customer, context, response, state } = require('./support.cjs')

test('repeated cart entries do not produce an unbounded concurrent Stripe burst', async () => {
  const count = 64
  const user = { ...customer, stripeCustomerID: 'cus_own', cart: { items:
    Array.from({ length: count }, () => ({ product: { id: 'paid', stripeProductID: 'prod_marker' }, quantity: 1 })),
  } }
  const ctx = context(user, [user])
  const endpoint = config.endpoints.find(e => e.path === '/create-payment-intent')
  if (!endpoint) return
  await endpoint.handler({ ...ctx.req, method: 'POST' }, response())
  assert.ok(state.peak < count,
    `one cart launched all ${state.peak} identical Stripe requests concurrently`)
})
