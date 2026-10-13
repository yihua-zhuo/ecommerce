const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write } = require('./support.cjs')

test('customer writes cannot change shared storefront content', async () => {
  const targets = [
    [load('src/payload/collections/Categories').default, ['create', 'update', 'delete'], { title: 'marker' }],
    ...['Header', 'Footer', 'Settings'].map(name => [load(`src/payload/globals/${name}`)[name], ['update'], { navItems: [], copyright: 'marker', productsPage: null }]),
  ]
  const accepted = []
  for (const [config, operations, data] of targets) {
    for (const operation of operations) {
      const result = await write(config, operation, request(), data, { id: '000000000000000000000004' })
      if (!result.refused) accepted.push(`${config.slug}:${operation}`)
    }
  }
  assert.deepEqual(accepted, [], 'ordinary customers must be refused CMS writes')
})
