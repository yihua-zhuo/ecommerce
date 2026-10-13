const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, access, customer, productID } = require('./support.cjs')

test('public callers cannot read an unpublished product', async () => {
  const products = load('src/payload/collections/Products').default
  const draft = { id: productID, title: 'Unpublished marker', _status: 'draft' }
  for (const user of [null, customer]) {
    const req = request(user)
    req.query = { draft: 'true' }
    assert.equal(await access(products, 'read', req, undefined, draft), false,
      'draft product must be excluded for anonymous callers and ordinary customers')
  }
})
