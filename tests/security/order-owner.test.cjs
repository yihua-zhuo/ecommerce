const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt, victim } = require('./support.cjs')
const { Orders } = require('../../src/payload/collections/Orders')

test('a customer cannot assign an order to another customer or clear their cart', async () => {
  const env = fixture()
  await attempt(() => write(Orders, env, 'create', { orderedBy: victim.id, total: 0, items: [] }))
  const other = await env.payload.findByID({ collection: 'users', id: victim.id })
  assert.deepEqual(other.cart, victim.cart, 'Another customer’s cart must be unchanged')
  assert.deepEqual(other.purchases, victim.purchases)
  assert.equal(env.records.orders.some(order =>
    (typeof order.orderedBy === 'object' ? order.orderedBy?.id : order.orderedBy) === victim.id), false,
  'A customer-supplied owner must not create an order against another account')
})
