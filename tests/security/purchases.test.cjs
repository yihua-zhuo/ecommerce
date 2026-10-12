const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt, customer, product } = require('./support.cjs')
const Users = require('../../src/payload/collections/Users').default
const { checkUserPurchases } = require('../../src/payload/collections/Products/access/checkUserPurchases')

test('a customer cannot give themselves access by editing purchases', async () => {
  const env = fixture()
  assert.equal(await checkUserPurchases({ req: env.req, doc: product }), false)
  await attempt(() => write(Users, env, 'update', { purchases: [product.id] }, customer))
  env.req.user = await env.payload.findByID({ collection: 'users', id: customer.id })
  assert.equal(await checkUserPurchases({ req: env.req, doc: product }), false,
    'An unpaid customer must remain outside the product paywall after a profile edit')
})
