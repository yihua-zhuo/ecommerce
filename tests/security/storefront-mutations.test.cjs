const test = require('node:test')
const assert = require('node:assert/strict')
const { logger } = require('./support.cjs')
const { Header } = require('../../src/payload/globals/Header')
const { Footer } = require('../../src/payload/globals/Footer')
const { Settings } = require('../../src/payload/globals/Settings')
const Categories = require('../../src/payload/collections/Categories').default
const { Media } = require('../../src/payload/collections/Media')

function matches(where, doc) {
  if (where.and) return where.and.every(part => matches(part, doc))
  if (where.or) return where.or.some(part => matches(part, doc))
  return Object.entries(where).every(([key, condition]) => {
    if ('equals' in condition) return doc[key] === condition.equals
    if ('not_equals' in condition) return doc[key] !== condition.not_equals
    if ('in' in condition) return condition.in.includes(doc[key])
    if ('not_in' in condition) return !condition.not_in.includes(doc[key])
    if ('exists' in condition) return condition.exists === (doc[key] != null)
    throw new Error(`Unsupported Payload query operator for ${key}`)
  })
}

for (const [config, operations] of [
  [Header, ['update']], [Footer, ['update']], [Settings, ['update']],
  [Categories, ['create', 'update', 'delete']], [Media, ['update', 'delete']],
]) {
  for (const operation of operations) test(`anonymous ${operation} of ${config.slug} is refused`, async () => {
    const access = config.access?.[operation]
    const result = access ? await access({
      req: { user: null, payload: { logger }, headers: {}, context: {} },
      id: '000000000000000000000003', data: {}, operation,
    }) : true
    const record = { id: '000000000000000000000003', title: 'Storefront marker' }
    const allowed = result === true || (result && typeof result === 'object' && matches(result, record))
    assert.equal(Boolean(allowed), false, 'Anonymous mutation of an existing storefront record must be refused')
  })
}
