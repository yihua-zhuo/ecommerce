const test = require('node:test')
const assert = require('node:assert/strict')
const { logger } = require('./support.cjs')
const Products = require('../../src/payload/collections/Products').default

// Interpret Payload query predicates at the framework boundary. No application
// callback is replaced: the real read policy and registered read hooks run below.
function matches(where, doc) {
  if (typeof where === 'boolean') return where
  if (!where) return true
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and') return value.every(part => matches(part, doc))
    if (key === 'or') return value.some(part => matches(part, doc))
    return Object.entries(value).every(([operator, expected]) => {
      const values = Array.isArray(expected) ? expected : String(expected).split(',')
      switch (operator) {
        case 'equals': return doc[key] === expected
        case 'not_equals': return doc[key] !== expected
        case 'in': return values.includes(doc[key])
        case 'not_in': return !values.includes(doc[key])
        case 'exists': return (doc[key] != null) === expected
        default: throw new Error(`Unsupported fixture predicate: ${operator}`)
      }
    })
  })
}

for (const user of [null, { id: 'customer', roles: ['customer'] }]) {
  test(`product archive does not disclose drafts to ${user ? 'a customer' : 'a visitor'}`, async () => {
    const published = {
      id: '000000000000000000000001', _status: 'published', title: 'Public product',
      layout: [{ blockType: 'archive', populateBy: 'collection', relationTo: 'products', limit: 10 }],
    }
    const draft = { id: '000000000000000000000002', _status: 'draft', title: 'Draft marker', layout: [] }
    const records = [published, draft]
    const payload = {
      logger,
      async find(options) {
        assert.equal(options.collection, 'products')
        // Payload Local API bypasses access unless overrideAccess is false.
        const req = options.req || { user: options.user || null, payload, context: options.context || {} }
        const access = options.overrideAccess === false
          ? await Products.access.read({ req }) : true
        const visible = records.filter(doc => matches(access, doc) && matches(options.where, doc))
        return {
          docs: structuredClone(options.limit ? visible.slice(0, options.limit) : visible),
          totalDocs: visible.length,
          totalPages: 1, page: 1, hasNextPage: false, hasPrevPage: false,
        }
      },
    }
    const req = { user, payload, context: {}, headers: {}, query: {} }
    const access = await Products.access.read({ req })
    assert.ok(matches(access, published), 'The public product must remain readable')
    assert.equal(matches(access, draft), false, 'Fixture draft must be private')
    let doc = structuredClone(published)
    for (const hook of Products.hooks.afterRead || []) {
      doc = await hook({ doc, req, context: req.context, collection: Products, findMany: false, depth: 0, overrideAccess: false }) || doc
    }
    assert.equal(JSON.stringify(doc).includes(draft.id), false,
      'Reading a published product must not reveal a draft identifier through an archive')
    for (const block of doc.layout || []) {
      if (block.blockType === 'archive' && block.populatedDocsTotal != null) {
        assert.ok(block.populatedDocsTotal <= 1,
          'The archive total must not include the private draft')
      }
    }
  })
}
