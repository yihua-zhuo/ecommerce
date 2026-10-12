const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, customer } = require('./support.cjs')
const Stripe = require('stripe')
const Users = require('../../src/payload/collections/Users').default
const { createPaymentIntent } = require('../../src/payload/endpoints/create-payment-intent')

test('a stored cart cannot cause unbounded duplicate Stripe lookups', async t => {
  const cart = Users.fields.find(field => field.name === 'cart')
  const items = cart?.fields?.find(field => field.name === 'items')
  // A finite framework-enforced storage bound prevents the oversized stored-cart
  // precondition. Runtime rejection, deduplication, or concurrency limits also work.
  if (Number.isSafeInteger(items?.maxRows) && items.maxRows > 0) return
  const env = fixture()
  const rows = 129
  env.records.users[0].cart.items = Array.from({ length: rows }, () => ({
    product: { id: '000000000000000000000003', stripeProductID: 'prod_marker' }, quantity: 1,
  }))
  let calls = 0
  let active = 0
  let peak = 0
  t.mock.method(Stripe.resources.Prices.prototype, 'list', async () => {
    calls++
    peak = Math.max(peak, ++active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    return { data: [{ id: 'price_marker', unit_amount: 1 }] }
  })
  t.mock.method(Stripe.resources.PaymentIntents.prototype, 'create', async () => ({ client_secret: 'fixture' }))
  const res = { status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this }, send(value) { this.body = value; return this } }
  await createPaymentIntent({ ...env.req, user: customer }, res)
  assert.ok(calls < rows || peak < rows,
    `Cart must be bounded, rejected, deduplicated, or processed with bounded concurrency; observed ${calls} calls and ${peak} concurrent requests`)
})
