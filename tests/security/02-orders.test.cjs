const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, customer, context, mutate } = require('./support.cjs')

test('an unpaid customer order cannot grant purchases or clear another cart', async () => {
  for (const owner of ['customer', 'other']) {
    const victim = { ...customer, id: 'other' }
    const ctx = context(customer, [customer, victim])
    await mutate(collection('orders'), 'create', {
      orderedBy: owner, total: 0, stripePaymentIntentID: 'pi_marker',
      items: [{ product: 'paid', price: 0, quantity: 1 }],
    }, ctx)
    for (const id of ['customer', 'other']) {
      assert.deepEqual(ctx.records.get(id).purchases, [], `unpaid order granted ${id} an entitlement`)
      assert.deepEqual(ctx.records.get(id).cart, customer.cart, `unpaid order cleared ${id}'s cart`)
    }
  }
})
