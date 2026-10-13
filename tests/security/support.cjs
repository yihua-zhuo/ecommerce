// Exercise exported Payload callbacks with in-memory framework/service boundaries.
// No application module is replaced; no listener, database, or Stripe connection is opened.
const mock = require('mock-require')
process.env.STRIPE_SECRET_KEY = 'sk_test_regression_marker'
process.env.NODE_ENV = 'production'
process.env.NEXT_PUBLIC_SERVER_URL = 'https://store.example'
process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://store.example'
process.env.NEXT_PRIVATE_DRAFT_SECRET = 'preview-marker'
// Override tsconfig's swc:true: the pinned SWC predates options emitted by
// current ts-node. Use the already-declared TypeScript compiler for tests.
require('ts-node').register({
  swc: false,
  transpileOnly: true,
  compilerOptions: { jsx: 'react' },
})
require.extensions['.scss'] = () => {}
const state = { priceCalls: 0, active: 0, peak: 0 }
class Stripe {
  customers = {
    list: async () => ({ data: [{ id: 'cus_other', email: 'marker@example.test' }] }),
    create: async () => ({ id: 'cus_new' }),
    retrieve: async id => ({ id, metadata: { userID: 'other' } }),
    update: async id => ({ id }),
  }
  prices = { list: async () => {
    state.priceCalls++; state.active++; state.peak = Math.max(state.peak, state.active)
    await new Promise(resolve => setImmediate(resolve))
    state.active--
    return { data: [{ id: 'price_marker', unit_amount: 100 }] }
  } }
  paymentIntents = {
    create: async () => ({ id: 'pi_marker', client_secret: 'marker' }),
    retrieve: async () => ({ id: 'pi_marker', status: 'requires_payment_method', amount: 0 }),
  }
}
mock('stripe', Stripe)
for (const id of ['payload/components/forms', 'payload/components',
  'payload/dist/admin/components/elements/CopyToClipboard',
  '@payloadcms/richtext-slate/dist/field/elements/Button']) mock(id, {})
mock('@payloadcms/richtext-slate', { slateEditor: () => ({}) })
mock('payload/config', { buildConfig: config => config })
mock('@payloadcms/bundler-webpack', { webpackBundler: () => ({}) })
mock('@payloadcms/db-mongodb', { mongooseAdapter: () => ({}) })
mock('@payloadcms/plugin-cloud', { payloadCloud: () => x => x })
for (const id of ['@payloadcms/plugin-nested-docs', '@payloadcms/plugin-redirects',
  '@payloadcms/plugin-seo', '@payloadcms/plugin-stripe']) mock(id, () => x => x)
mock('next/headers', { draftMode: () => ({ enable() {}, disable() {} }) })
mock('next/navigation', { redirect: url => { const e = new Error('redirect'); e.destination = url; throw e } })
const config = require('../../src/payload/payload.config.ts').default
const collection = slug => config.collections.find(c => c.slug === slug)
const customer = { id: 'customer', email: 'marker@example.test', roles: ['customer'], purchases: [], cart: { items: [{ product: 'paid', quantity: 1 }] } }
const clone = x => JSON.parse(JSON.stringify(x))
function context(user = customer, users = [customer]) {
  const records = new Map(users.map(u => [u.id, clone(u)]))
  const effects = []
  const payload = {
    config, logger: { info() {}, error() {}, warn() {} }, db: { defaultIDType: 'text' },
    find: async () => ({ docs: [...records.values()], totalDocs: records.size }),
    findByID: async ({ id }) => clone(records.get(id) || { id, stripeProductID: 'prod_marker' }),
    update: async ({ id, data }) => { effects.push({ operation: 'update', id, data }); const doc = { ...records.get(id), ...data }; records.set(id, doc); return doc },
    delete: async args => { effects.push({ operation: 'delete', ...args }); return {} },
    updateGlobal: async args => { effects.push({ operation: 'updateGlobal', ...args }); return {} },
    create: async args => { effects.push({ operation: 'create', ...args }); return { id: 'seed-marker', ...args.data } },
  }
  return { req: { user: clone(user), payload, body: {}, headers: {}, context: {} }, records, effects }
}
function matches(where, doc) {
  if (typeof where === 'boolean') return where
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return condition.every(x => matches(x, doc))
    if (key === 'or') return condition.some(x => matches(x, doc))
    const value = doc[key]
    return Object.entries(condition).every(([op, operand]) => {
      if (op === 'equals') return value === operand
      if (op === 'not_equals') return value !== operand
      if (op === 'in') return operand.includes(value)
      if (op === 'not_in') return !operand.includes(value)
      if (op === 'exists') return (value !== undefined) === operand
      throw new Error(`Unsupported query operator: ${op}`)
    })
  })
}
async function allowed(fn, args, doc) { return fn ? matches(await fn(args), doc) : !!args.req.user }
class Denied extends Error {}
async function hooks(list, args, key) {
  for (const fn of list || []) { const result = await fn(args); if (result !== undefined) args[key] = result }
  return args[key]
}
// Payload's public configuration contract: collection access, field access/defaults,
// validators, and registered lifecycle callbacks. Storage is a framework test double.
async function mutate(c, operation, input, ctx, original = {}) {
  const args = { req: ctx.req, operation, id: original.id, data: clone(input), originalDoc: original, context: {} }
  if (!await allowed(c.access?.[operation], args, original)) return { rejected: true, doc: original }
  try {
    await hooks(c.hooks?.beforeOperation, { ...args, args }, 'args')
    args.data = await hooks(c.hooks?.beforeValidate, args, 'data')
    async function fields(list, data) {
      for (const field of list || []) {
        if (field.tabs) for (const tab of field.tabs) await fields(tab.fields, data)
        if (!field.name) { await fields(field.fields, data); continue }
        const name = field.name
        if (field.access?.[operation] && !await field.access[operation]({ ...args, siblingData: data, doc: original })) delete data[name]
        if (data[name] === undefined && operation === 'create' && field.defaultValue !== undefined) data[name] = typeof field.defaultValue === 'function' ? await field.defaultValue(args) : clone(field.defaultValue)
        for (const phase of ['beforeValidate', 'beforeChange']) {
          const value = await hooks(field.hooks?.[phase], { ...args, siblingData: data, value: data[name] }, 'value')
          if (value !== undefined) data[name] = value
        }
        if (data[name] !== undefined) {
          if (field.maxRows && data[name].length > field.maxRows) throw new Denied()
          if (field.validate && await field.validate(data[name], { ...args, siblingData: data }) !== true) throw new Denied()
          if (field.fields) for (const child of Array.isArray(data[name]) ? data[name] : [data[name]]) await fields(field.fields, child)
        }
      }
    }
    await fields(c.fields, args.data)
    args.data = await hooks(c.hooks?.beforeChange, args, 'data')
    let doc = { ...original, ...args.data }
    doc = await hooks(c.hooks?.afterChange, { ...args, doc, previousDoc: original }, 'doc')
    return { rejected: false, doc }
  } catch (error) {
    if (error instanceof Denied || [400, 401, 403, 422].includes(error.status || error.statusCode)) return { rejected: true, doc: original }
    throw error
  }
}
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this }, send(body) { this.body = body; return this } } }
module.exports = { config, collection, customer, context, mutate, allowed, matches, response, state }
