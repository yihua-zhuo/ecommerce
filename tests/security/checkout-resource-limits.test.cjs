const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { load, request, response, customer, productID } = require('./support.cjs')

test('checkout bounds oversized carts and does not create fresh intents for immediate retries', async t => {
  // Replace only the external Stripe SDK. Model its idempotency contract:
  // equal keys return the same intent; absent or different keys create another.
  const intents = new Map()
  const created = []
  const priceCalls = []
  class StripeDouble {
    prices = { list: async args => {
      priceCalls.push(args)
      return { data: [{ id: 'price_marker', unit_amount: 100, currency: 'usd' }] }
    } }
    paymentIntents = {
      create: async (args, options = {}) => {
        const key = options.idempotencyKey
        if (key && intents.has(key)) return intents.get(key)
        const intent = { ...args, id: `pi_${created.length + 1}`,
          client_secret: `secret_${created.length + 1}`, status: 'requires_payment_method' }
        created.push(intent)
        if (key) intents.set(key, intent)
        return intent
      },
      retrieve: async id => created.find(intent => intent.id === id),
      list: async () => ({ data: created }),
    }
    customers = { retrieve: async id => ({ id }) }
  }
  const originalLoad = Module._load
  t.mock.method(Module, '_load', function (name, parent, main) {
    if (name === 'stripe') return StripeDouble
    return originalLoad.call(this, name, parent, main)
  })
  const config = await load('src/payload/payload.config').default
  const endpoint = config.endpoints.find(entry => entry.path === '/create-payment-intent')
  if (!endpoint) return // Disabling checkout also removes the external effect.

  const row = { product: { id: productID, stripeProductID: 'prod_marker' }, quantity: 1 }
  const user = { ...customer, stripeCustomerID: 'cus_marker',
    cart: { items: Array.from({ length: 101 }, () => ({ ...row })) } }
  const req = request(customer, { users: [user] })
  req.method = 'POST'
  await endpoint.handler(req, response())
  assert.ok(priceCalls.length < 101,
    'an oversized cart must be refused, capped, or coalesced before per-row Stripe fan-out')

  // A single valid item is enough to expose duplicate payment creation. The
  // retry is only two milliseconds later, even across a wall-clock boundary.
  user.cart.items = [row]
  created.length = 0
  intents.clear()
  let now = 1800000299999
  t.mock.method(Date, 'now', () => now)
  const first = response()
  await endpoint.handler(req, first)
  now += 2
  const second = response()
  await endpoint.handler(req, second)
  assert.ok(created.length <= 1,
    `immediately retrying an unchanged cart created ${created.length} separate Stripe PaymentIntents`)
})
