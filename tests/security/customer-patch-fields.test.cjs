const test = require('node:test')
const assert = require('node:assert/strict')
const { customer, logger } = require('./support.cjs')
const Stripe = require('stripe')
const Users = require('../../src/payload/collections/Users').default

test('a customer PATCH cannot change merchant-controlled Stripe metadata', async t => {
  const updates = []
  t.mock.method(Stripe.resources.Customers.prototype, 'retrieve', async () => ({ id: customer.stripeCustomerID }))
  t.mock.method(Stripe.resources.Customers.prototype, 'update', async (id, data) => {
    updates.push(data)
    return { id }
  })
  const endpoint = Users.endpoints.find(item => item.method.toLowerCase() === 'patch' && item.path.endsWith('/customer'))
  if (!endpoint) return // Removing the proxy is also a secure fix.
  const req = { user: customer, method: 'PATCH', params: { userID: customer.id, teamID: customer.id },
    body: { metadata: { security_marker: 'marker' } }, headers: {}, context: {}, payload: { logger } }
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }, send(body) { this.body = body; return this }, end() {} }
  await endpoint.handler(req, res, error => { if (error) throw error })
  assert.equal(updates.some(data => Object.hasOwn(data, 'metadata')), false,
    'The secret-key Stripe call must not receive customer-supplied merchant metadata')
})
