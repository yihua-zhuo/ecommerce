const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', jsx: 'react' },
})
process.env.STRIPE_SECRET_KEY = 'sk_test_security_regression'

// Only browser framework imports are stubbed. Application policies and hooks
// are loaded unchanged; no database or Stripe operation is invoked.
const load = Module._load
let Users
try {
  Module._load = function (name, parent, main) {
    if (name.startsWith('payload/components/') ||
        name.startsWith('payload/dist/admin/components/')) return {}
    return load.call(this, name, parent, main)
  }
  Users = require('../../src/payload/collections/Users').default
} finally {
  Module._load = load
}

// Payload collection access defaults to authenticated users; field access
// defaults to true. A query constraint is evaluated against this user's record.
function matches(where, doc) {
  if (typeof where === 'boolean') return where
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return condition.every(part => matches(part, doc))
    if (key === 'or') return condition.some(part => matches(part, doc))
    return Object.entries(condition).every(([operator, value]) => {
      if (operator === 'equals') return doc[key] === value
      if (operator === 'not_equals') return doc[key] !== value
      if (operator === 'in') return value.includes(doc[key])
      if (operator === 'not_in') return !value.includes(doc[key])
      throw new Error(`Unsupported access-query operator: ${operator}`)
    })
  })
}

const customer = {
  id: '000000000000000000000001', collection: 'users',
  email: 'customer@example.invalid', roles: ['customer'], purchases: [],
}
const productID = '000000000000000000000002'

for (const operation of ['create', 'update']) {
  test(`customer cannot self-assign purchases during ${operation}`, async () => {
    const data = { email: customer.email, purchases: [productID] }
    const args = {
      req: { user: customer, context: {}, body: data },
      id: customer.id, data, siblingData: data, doc: customer,
      originalDoc: customer, operation,
    }
    const collectionPolicy = Users.access?.[operation]
    const collectionResult = collectionPolicy ? await collectionPolicy(args) : true
    if (!matches(collectionResult, customer)) return

    const purchases = Users.fields.find(field => field.name === 'purchases')
    // Removing the client-writable purchase field also closes this entry point.
    if (!purchases) return
    const fieldPolicy = purchases.access?.[operation]
    const fieldResult = fieldPolicy ? await fieldPolicy(args) : true
    assert.equal(fieldResult, false,
      `Customer must not be authorized to self-assign purchases during ${operation}`)
  })
}
