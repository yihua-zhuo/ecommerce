const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt, victim } = require('./support.cjs')
const Stripe = require('stripe')
const Users = require('../../src/payload/collections/Users').default

test('an unverified registration email does not claim an existing Stripe customer', async t => {
  // Substitute the external SDK boundary, never the application's hook.
  t.mock.method(Stripe.resources.Customers.prototype, 'list', async () => ({ data: [{ id: victim.stripeCustomerID, email: victim.email }] }))
  t.mock.method(Stripe.resources.Customers.prototype, 'create', async () => ({ id: 'cus_new_registration' }))
  const env = fixture()
  env.req.user = null
  // The existing billing customer has no corresponding local login yet.
  env.records.users = [env.records.users[0]]
  // No Stripe ID is submitted: inspect the association assigned by server hooks,
  // which must survive the harness's filtering of client-controlled fields.
  await attempt(() => write(Users, env, 'create', { email: victim.email, name: 'Registration marker' }))
  assert.equal(env.records.users.some(user => user.stripeCustomerID === victim.stripeCustomerID), false,
    'Matching an unverified email must never transfer an existing Stripe customer to a new login')
})
