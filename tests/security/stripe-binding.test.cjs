const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write, customer, stripe } = require('./support.cjs')

test('customers cannot bind their account to someone else’s Stripe customer', async () => {
  const users = load('src/payload/collections/Users').default
  const original = { ...customer, stripeCustomerID: 'cus_own_account' }
  const req = request(customer, { users: [original] })
  const result = await write(users, 'update', req, { stripeCustomerID: 'cus_other_account' }, original)
  assert.notEqual(result.doc.stripeCustomerID, 'cus_other_account', 'self-update must not accept another account’s Stripe ID')

  const signup = await write(users, 'create', request(null, { users: [original] }), {
    email: 'new@example.invalid', stripeCustomerID: 'cus_other_account',
  })
  assert.notEqual(signup.doc.stripeCustomerID, 'cus_other_account', 'public signup must not accept a supplied Stripe binding')

  stripe.existingCustomers = [{ id: 'cus_other_account', email: customer.email }]
  const byEmail = await write(users, 'create', request(null, { users: [original] }), { email: customer.email })
  assert.notEqual(byEmail.doc.stripeCustomerID, 'cus_other_account', 'an unverified matching email is not proof of Stripe account ownership')
})
