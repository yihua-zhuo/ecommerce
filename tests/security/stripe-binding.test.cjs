const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt, customer, victim } = require('./support.cjs')
const Users = require('../../src/payload/collections/Users').default

test('customers cannot replace their trusted Stripe customer binding', async () => {
  const env = fixture()
  await attempt(() => write(Users, env, 'update', { stripeCustomerID: victim.stripeCustomerID }, customer))
  const user = await env.payload.findByID({ collection: 'users', id: customer.id })
  assert.notEqual(user.stripeCustomerID, victim.stripeCustomerID,
    'A profile edit must not bind this account to another Stripe customer')
})
