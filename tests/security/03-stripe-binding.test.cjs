const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, customer, context, mutate } = require('./support.cjs')

test('registration and self-update cannot select another Stripe customer', async () => {
  for (const operation of ['create', 'update']) {
    const ctx = context(operation === 'create' ? null : customer)
    const result = await mutate(collection('users'), operation,
      { email: customer.email, stripeCustomerID: 'cus_other' }, ctx,
      operation === 'update' ? { ...customer, stripeCustomerID: 'cus_own' } : {})
    assert.ok(result.rejected || result.doc.stripeCustomerID !== 'cus_other',
      `${operation} bound the account to another Stripe customer`)
  }
})

test('an unverified signup email is not proof of Stripe customer ownership', async () => {
  const result = await mutate(collection('users'), 'create', { email: customer.email }, context(null))
  assert.ok(result.rejected || result.doc.stripeCustomerID !== 'cus_other',
    'signup adopted an existing Stripe customer solely by email')
})
