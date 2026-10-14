const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', jsx: 'react' },
})

const load = Module._load
let resources
try {
  // The editor UI is irrelevant to access decisions and is never rendered.
  Module._load = function (name, parent, main) {
    if (name === '@payloadcms/richtext-slate') return { slateEditor: () => ({}) }
    return load.call(this, name, parent, main)
  }
  resources = [
    [require('../../src/payload/globals/Header').Header, ['update'], { navItems: [] }],
    [require('../../src/payload/globals/Footer').Footer, ['update'], { copyright: 'marker' }],
    [require('../../src/payload/globals/Settings').Settings, ['update'], { productsPage: null }],
    [require('../../src/payload/collections/Categories').default,
      ['create', 'update', 'delete'], { title: 'marker' }],
    [require('../../src/payload/collections/Media').Media,
      ['create', 'update', 'delete'], { alt: 'marker' }],
  ]
} finally {
  Module._load = load
}

const customer = {
  id: '000000000000000000000001', collection: 'users', roles: ['customer'],
}
const admin = {
  id: '000000000000000000000002', collection: 'users', roles: ['admin'],
}

// These are unit tests of Payload's public access callback contract. Omitting
// a callback grants authenticated users access in Payload 2.
async function decision(config, operation, user, data) {
  const policy = config.access?.[operation]
  return policy ? policy({
    req: { user, context: {}, body: data }, data,
    id: '000000000000000000000003',
  }) : Boolean(user)
}

for (const [config, operations, data] of resources) {
  test(`${config.slug} remains publicly readable`, async () => {
    assert.equal(await decision(config, 'read', null, {}), true,
      'Public storefront resources must remain readable')
  })
  for (const operation of operations) {
    test(`customer cannot ${operation} ${config.slug}`, async () => {
      assert.equal(await decision(config, operation, customer, data), false,
        `Customer must be refused ${operation} access to ${config.slug}`)
    })
    test(`administrator can ${operation} ${config.slug}`, async () => {
      assert.equal(await decision(config, operation, admin, data), true,
        `Administrator must retain ${operation} access to ${config.slug}`)
    })
  }
}
