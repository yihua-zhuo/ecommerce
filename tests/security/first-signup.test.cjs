const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write } = require('./support.cjs')

test('the first public signup receives no administrator privileges', async () => {
  const users = load('src/payload/collections/Users').default
  const result = await write(users, 'create', request(null, { users: [] }), {
    email: 'first@example.invalid', password: 'benign-test-password',
  })
  assert.equal((result.doc.roles || []).includes('admin'), false,
    'an empty user database must not grant administrator privileges to a public registrant')
})
