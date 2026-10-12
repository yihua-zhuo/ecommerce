const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt, customer, product } = require('./support.cjs')
const { Orders } = require('../../src/payload/collections/Orders')

test('an order without verified payment cannot grant a purchase', async () => {
  const env = fixture()
  await attempt(() => write(Orders, env, 'create', {
    orderedBy: customer.id, total: 0,
    items: [{ product: product.id, price: 0, quantity: 1 }],
  }))
  const user = await env.payload.findByID({ collection: 'users', id: customer.id })
  assert.deepEqual(user.purchases, [], 'Submitting an unpaid order must not grant paid-product access')
})
