const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, context, allowed } = require('./support.cjs')

test('anonymous collection reads exclude unpublished products', async () => {
  const products = collection('products')
  const { req } = context(null)
  const draft = { id: 'draft-marker', title: 'Unreleased marker', _status: 'draft' }
  assert.equal(await allowed(products.access?.read, { req }, draft), false,
    'anonymous product read authorization includes draft records')
})
