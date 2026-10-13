const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, context, mutate } = require('./support.cjs')

test('first anonymous customer registration does not become an administrator', async () => {
  const result = await mutate(collection('users'), 'create',
    { email: 'first@example.test' }, context(null, []))
  assert.ok(result.rejected || !result.doc.roles?.includes('admin'),
    'the first public signup received administrator privileges')
})
