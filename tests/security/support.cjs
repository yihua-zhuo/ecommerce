// Exercise the exported Payload configuration callbacks without a database or HTTP server.
// Only framework presentation modules are substituted; application modules remain intact.
const { mock } = require('node:test')
const Module = require('node:module')
// Payload's editor imports admin components through relative paths as well as
// package exports. Their styles are normally consumed by the bundler, not Node.
// Keep the JavaScript intact and provide the bundler's no-runtime-effect handling
// for stylesheet imports in this server-side callback harness.
for (const extension of ['.css', '.scss', '.sass']) {
  require.extensions[extension] = module => { module.exports = {} }
}
const load = Module._load
mock.method(Module, '_load', function (name, ...args) {
  if (name.startsWith('payload/components/') || name.startsWith('payload/dist/admin/')) {
    return { __esModule: true, default: () => null }
  }
  return load.call(this, name, ...args)
})
require('ts-node').register({ transpileOnly: true, compilerOptions: { jsx: 'react' } })
process.env.STRIPE_SECRET_KEY = 'sk_test_security_fixture'

const clone = value => JSON.parse(JSON.stringify(value))
const customer = {
  id: '000000000000000000000001', email: 'customer@example.invalid',
  roles: ['customer'], purchases: [], stripeCustomerID: 'cus_self', cart: { items: [] },
}
const victim = {
  ...customer, id: '000000000000000000000002', email: 'other@example.invalid',
  stripeCustomerID: 'cus_other', cart: { items: [{ product: '000000000000000000000003', quantity: 1 }] },
}
const product = { id: '000000000000000000000003', title: 'Paid fixture', price: 100 }
const logger = { info() {}, error() {}, warn() {}, debug() {} }

function fixture() {
  const records = { users: [clone(customer), clone(victim)], products: [clone(product)], orders: [] }
  const payload = {
    logger,
    findByID: async ({ collection, id }) => clone(records[collection].find(doc => doc.id === id)),
    find: async ({ collection }) => ({ docs: clone(records[collection] || []), totalDocs: (records[collection] || []).length }),
    update: async ({ collection, id, data }) => {
      const doc = records[collection].find(doc => doc.id === id)
      Object.assign(doc, clone(data))
      return clone(doc)
    },
  }
  const req = { user: clone(customer), payload, context: {}, headers: {}, body: {} }
  return { records, payload, req }
}

function matches(where, doc) {
  if (where.and) return where.and.every(part => matches(part, doc))
  if (where.or) return where.or.some(part => matches(part, doc))
  return Object.entries(where).every(([key, condition]) => {
    if ('equals' in condition) return doc[key] === condition.equals
    if ('in' in condition) return condition.in.includes(doc[key])
    throw new Error(`Unsupported fixture query operator for ${key}`)
  })
}

// The harness invokes the public collection/field callback contract, including
// access, validation and change hooks. The backing Payload API is an in-memory
// framework fixture, so entitlement and cart side effects remain observable.
async function write(config, env, operation, submitted, originalDoc = {}) {
  const { req, records } = env
  let data = clone(submitted)
  req.body = data
  const args = () => ({ req, operation, data, id: originalDoc.id, originalDoc,
    context: req.context, collection: config })
  const access = config.access?.[operation]
  const allowed = access ? await access(args()) : true
  if (!allowed || (typeof allowed === 'object' && !matches(allowed, originalDoc))) return null
  for (const hook of config.hooks?.beforeOperation || []) await hook({ ...args(), args: args() })
  async function fields(stage, list, siblingData, siblingDoc = {}) {
    for (const field of list) {
      if (!field.name) {
        if (field.fields) await fields(stage, field.fields, siblingData, siblingDoc)
        continue
      }
      const fieldArgs = () => ({ ...args(), siblingData, siblingDoc,
        value: siblingData[field.name], originalDoc, previousValue: siblingDoc[field.name] })
      if (stage === 'access' && field.access?.[operation] &&
          !await field.access[operation](fieldArgs())) {
        delete siblingData[field.name]
        continue
      }
      for (const hook of field.hooks?.[stage] || []) {
        siblingData[field.name] = await hook(fieldArgs())
      }
      if (field.fields && siblingData[field.name]) {
        const children = Array.isArray(siblingData[field.name]) ? siblingData[field.name] : [siblingData[field.name]]
        for (const child of children) await fields(stage, field.fields, child)
      }
    }
  }
  // Field access restricts client-submitted values. It must not erase trusted
  // values subsequently produced by collection hooks (such as a Stripe binding).
  await fields('access', config.fields, data, originalDoc)
  for (const hook of config.hooks?.beforeValidate || []) data = (await hook(args())) || data
  await fields('beforeValidate', config.fields, data, originalDoc)
  for (const hook of config.hooks?.beforeChange || []) data = (await hook(args())) || data
  await fields('beforeChange', config.fields, data, originalDoc)
  let doc = { ...clone(originalDoc), ...data, id: originalDoc.id || '000000000000000000000004' }
  const rows = records[config.slug]
  const index = rows.findIndex(row => row.id === doc.id)
  if (index < 0) rows.push(clone(doc))
  else rows[index] = clone(doc)
  for (const hook of config.hooks?.afterChange || []) {
    doc = (await hook({ ...args(), doc, previousDoc: originalDoc })) || doc
  }
  return doc
}

async function attempt(action) {
  try { return await action() } catch (error) {
    // Payload also permits hooks to reject a write with a plain Error. Inspect
    // persisted effects after a rejection; do not treat programming errors as refusals.
    if (error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError) throw error
    if ((error.status >= 400 && error.status < 500) || error.constructor === Error) return null
    throw error
  }
}

module.exports = { fixture, write, attempt, customer, victim, product, logger }
