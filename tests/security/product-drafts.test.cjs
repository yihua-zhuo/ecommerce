const test = require('node:test')
const assert = require('node:assert/strict')
const { logger } = require('./support.cjs')
const Products = require('../../src/payload/collections/Products').default

function matches(where, doc) {
  if (where.and) return where.and.every(part => matches(part, doc))
  if (where.or) return where.or.some(part => matches(part, doc))
  return Object.entries(where).every(([key, conditions]) => Object.entries(conditions).every(([op, value]) => {
    const actual = doc[key]
    switch (op) {
      case 'equals': return actual === value
      case 'not_equals': return actual !== value
      case 'in': return value.includes(actual)
      case 'not_in': return !value.includes(actual)
      case 'exists': return value === (actual !== undefined && actual !== null)
      case 'less_than': return actual < value
      case 'less_than_equal': return actual <= value
      case 'greater_than': return actual > value
      case 'greater_than_equal': return actual >= value
      default: throw new Error(`Unsupported Payload query operator: ${op}`)
    }
  }))
}

test('public product read policy excludes drafts, including explicit draft requests', async () => {
  const draft = { id: '000000000000000000000003', title: 'Unreleased marker', _status: 'draft' }
  const req = { user: null, query: { draft: 'true' }, headers: {}, context: {}, payload: { logger } }
  const rule = Products.access?.read ? await Products.access.read({ req, id: draft.id, doc: draft }) : true
  const visible = rule === true || (rule && typeof rule === 'object' && matches(rule, draft))
  assert.equal(Boolean(visible), false, 'Anonymous draft requests must not return unpublished product data')
})
