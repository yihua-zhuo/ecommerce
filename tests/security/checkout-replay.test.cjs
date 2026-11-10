const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
test('retrying an identical checkout does not allocate fresh Stripe intents', async () => {
  const config = await h.config()
  const route = config.endpoints.find(r => r.path === '/create-payment-intent')
  if (!route) return
  const account = h.user()
  account.cart.items = [{ product: { id: 'product_marker', stripeProductID: 'prod_marker' }, quantity: 1 }]
  for (let i = 0; i < 2; i++) {
    const { req, res } = h.request(account)
    req.headers['idempotency-key'] = 'checkout_marker'
    await h.invoke(route.handler, req, res)
  }
  const intents = h.calls.filter(c => c.kind === 'intent')
  const allocations = new Set(intents.map((c, i) => c.options?.idempotencyKey || `non-idempotent-${i}`))
  assert.ok(allocations.size <= 1, 'Identical checkout retry must not allocate a second PaymentIntent')
})
