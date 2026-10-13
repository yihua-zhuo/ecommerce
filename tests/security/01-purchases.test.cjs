const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, customer, context, mutate } = require('./support.cjs')

test('public signup and self-update cannot award an unpaid product', async () => {
  for (const operation of ['create', 'update']) {
    const ctx = context(operation === 'create' ? null : customer)
    const result = await mutate(collection('users'), operation,
      { email: customer.email, purchases: ['paid'] }, ctx,
      operation === 'update' ? customer : {})
    assert.ok(result.rejected || !result.doc.purchases?.some(p => (p.id || p) === 'paid'),
      `${operation} accepted a caller-supplied paid entitlement`)
  }
})
