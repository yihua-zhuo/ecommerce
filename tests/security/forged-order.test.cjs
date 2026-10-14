const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
test('an unpaid customer order cannot grant a product', async () => {
  const config = await h.config()
  const orders = config.collections.find(c => c.slug === 'orders')
  const account = h.user()
  const { req } = h.request(account)
  req.body = { orderedBy: account.id, stripePaymentIntentID: 'pi_unpaid_marker', total: 0, items: [{ product: 'product_marker', price: 0, quantity: 1 }] }
  try { await h.create(orders, req, req.body) }
  catch (error) { if (![400, 401, 403, 404, 409, 422].includes(error.status || error.statusCode)) throw error }
  assert.ok(!account.purchases.includes('product_marker'), 'Unpaid order must not grant product entitlement')
})
