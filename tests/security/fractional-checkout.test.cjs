const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
test('a fractional product cannot be purchased for a fractional price', async () => {
  const config = await h.config()
  const route = config.endpoints.find(r => r.path === '/create-payment-intent')
  if (!route) return // Removing this checkout surface is also safe.
  const account = h.user()
  account.cart.items = [{ product: { id: 'product_marker', stripeProductID: 'prod_marker' }, quantity: 0.5 }]
  const { req, res } = h.request(account)
  await h.invoke(route.handler, req, res)
  assert.ok(!h.calls.some(c => c.kind === 'intent' && c.amount > 0 && c.amount < 1000), 'Fractional quantity must not create an underpriced PaymentIntent')
})
