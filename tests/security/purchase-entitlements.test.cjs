const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write, customer, productID } = require('./support.cjs')

test('customers cannot supply their own purchase entitlements', async () => {
  const users = load('src/payload/collections/Users').default
  const original = { ...customer, purchases: [] }
  for (const operation of ['create', 'update']) {
    const req = request(operation === 'create' ? null : customer, { users: [original] })
    const result = await write(users, operation, req, {
      email: 'marker@example.invalid', purchases: [productID],
    }, operation === 'update' ? original : {})
    assert.equal((result.doc.purchases || []).some(item => (item.id || item) === productID), false,
      `${operation} must not confer an unearned purchase`)
  }
})
