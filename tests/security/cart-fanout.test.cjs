const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, response, write, customer, productID, stripe } = require('./support.cjs')

test('duplicate cart rows cannot cause unbounded Stripe price lookups', async () => {
  const users = load('src/payload/collections/Users').default
  const original = { ...customer, stripeCustomerID: 'cus_own_account', cart: { items: [] } }
  const count = 1001
  const result = await write(users, 'update', request(), {
    cart: { items: Array.from({ length: count }, () => ({ product: productID, quantity: 1 })) },
  }, original)
  if (result.refused) return
  for (const item of result.doc.cart.items) item.product = { id: productID, stripeProductID: 'prod_marker' }
  const config = await load('src/payload/payload.config').default
  const endpoint = config.endpoints.find(item => item.path === '/create-payment-intent')
  if (!endpoint) return
  await endpoint.handler(request(customer, { users: [result.doc] }), response())
  assert.ok(stripe.prices.length < count,
    `one product repeated in the cart triggered ${stripe.prices.length} Stripe requests; reject, cap, or coalesce the rows`)
})
