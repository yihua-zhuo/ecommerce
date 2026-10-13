const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write, customer, productID } = require('./support.cjs')

test('an unpaid customer-created order cannot grant purchases or clear a cart', async () => {
  const orders = load('src/payload/collections/Orders').Orders
  const victim = { id: '000000000000000000000004', purchases: [], cart: { items: [{ product: productID, quantity: 1 }] } }
  const req = request(customer, { users: [victim] })
  await write(orders, 'create', req, {
    orderedBy: victim.id, total: 0, stripePaymentIntentID: 'pi_unpaid_marker',
    items: [{ product: productID, quantity: 1, price: 0 }],
  })
  assert.deepEqual(victim.purchases, [], 'unverified payment must not grant another user a purchase')
  assert.equal(victim.cart.items.length, 1, 'unverified order must not clear another user’s cart')
})
