const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, response, write, customer, productID, stripe } = require('./support.cjs')

test('fractional cart quantities cannot produce an underpriced payment', async () => {
  const users = load('src/payload/collections/Users').default
  const original = { ...customer, stripeCustomerID: 'cus_own_account', cart: { items: [] } }
  const result = await write(users, 'update', request(), {
    cart: { items: [{ product: productID, quantity: 0.5 }] },
  }, original)
  if (result.refused) return
  const fullUser = result.doc
  for (const item of fullUser.cart.items) item.product = { id: productID, stripeProductID: 'prod_marker' }
  const config = await load('src/payload/payload.config').default
  const endpoint = config.endpoints.find(item => item.path === '/create-payment-intent')
  if (!endpoint) return
  await endpoint.handler(request(customer, { users: [fullUser] }), response())
  assert.equal(stripe.intents.some(intent => intent.amount > 0 && intent.amount < 100), false,
    'a 100-cent indivisible product must not be charged at 50 cents')
})
