// Test doubles live exclusively at dependency/framework boundaries.
const Module = require('node:module')
const path = require('node:path')
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', jsx: 'react' } })
process.env.STRIPE_SECRET_KEY = 'sk_test_marker'
process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://store.example.invalid'
const calls = []
const stripe = {
  customers: {
    list: async () => ({ data: [{ id: 'cus_other', email: 'marker@example.invalid' }] }),
    create: async () => ({ id: 'cus_new' }),
    retrieve: async id => ({ id, email: 'marker@example.invalid' }),
    update: async (id, data) => { calls.push({ kind: 'customer-update', id }); return { id, ...data } },
  },
  prices: { list: async args => {
    calls.push({ kind: 'price', ...args })
    await Promise.resolve()
    return { data: [{ id: 'price_marker', unit_amount: 1000, currency: 'usd' }] }
  } },
  paymentIntents: {
    create: async (data, options) => {
      calls.push({ kind: 'intent', ...data, options })
      return { id: 'pi_marker', client_secret: 'marker', ...data }
    },
    retrieve: async id => ({ id, status: 'requires_payment_method', amount: 0, customer: 'cus_other' }),
    list: async () => ({ data: [] }),
  },
}
const identityPlugin = () => config => config
const stubs = {
  stripe: function Stripe() { return stripe },
  'payload/config': { buildConfig: config => config },
  '@payloadcms/bundler-webpack': { webpackBundler: () => ({}) },
  '@payloadcms/db-mongodb': { mongooseAdapter: () => ({}) },
  '@payloadcms/plugin-cloud': { payloadCloud: identityPlugin },
  '@payloadcms/plugin-nested-docs': identityPlugin,
  '@payloadcms/plugin-redirects': identityPlugin,
  '@payloadcms/plugin-seo': identityPlugin,
  '@payloadcms/plugin-stripe': identityPlugin,
  '@payloadcms/richtext-slate': { slateEditor: () => ({}) },
}
const originalLoad = Module._load
Module._load = function (name, parent, main) {
  if (Object.hasOwn(stubs, name)) return stubs[name]
  if (name.startsWith('payload/components') || name.startsWith('payload/dist/admin/components/') || name.startsWith('@payloadcms/richtext-slate/dist/field/')) return {}
  return originalLoad.call(this, name, parent, main)
}
require.extensions['.scss'] = module => { module.exports = {} }
const load = file => require(path.resolve(__dirname, '../..', file))
const config = () => load('src/payload/payload.config').default
const user = () => ({ id: 'user_marker', collection: 'users', roles: ['customer'], email: 'marker@example.invalid', stripeCustomerID: 'cus_self', purchases: [], cart: { items: [] } })
function request(account = user()) {
  const effects = []
  const payload = {
    logger: { info() {}, warn() {}, error() {} }, db: { defaultIDType: 'text' },
    find: async () => ({ docs: [], totalDocs: 0 }),
    findByID: async ({ collection }) => collection === 'users' ? account : { id: 'product_marker', stripeProductID: 'prod_marker' },
    create: async ({ data }) => ({ id: 'created_marker', ...data }),
    update: async args => { effects.push(args); if (args.collection === 'users' && account) Object.assign(account, args.data); return { id: args.id, ...args.data } },
    delete: async args => { effects.push(args); return { docs: [] } },
    updateGlobal: async args => { effects.push(args); return args.data },
  }
  const req = { user: account, payload, method: 'POST', headers: {}, body: {}, query: {}, params: {}, context: {}, get(name) { return this.headers[name.toLowerCase()] } }
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this }, send(body) { this.body = body; return this }, end() { return this }, sendStatus(n) { this.statusCode = n; return this } }
  req.res = res
  return { req, res, effects }
}
async function invoke(handler, req, res) {
  try { await handler(req, res, error => { if (error) throw error }) }
  catch (error) {
    // Only intentional validation/access rejection is a successful refusal.
    if (![400, 401, 403, 404, 405, 409, 422, 429].includes(error.status || error.statusCode)) throw error
    res.statusCode = error.status || error.statusCode
  }
}
// Execute public collection access and lifecycle callbacks in Payload order.
// This in-memory adapter does not implement MongoDB or Payload's REST parser.
async function create(collection, req, input) {
  let data = structuredClone(input)
  const args = () => ({ req, data, operation: 'create', originalDoc: {}, context: req.context })
  if (collection.access?.create && await collection.access.create({ req, data }) !== true) return null
  for (const phase of ['beforeValidate', 'beforeChange']) {
    for (const field of collection.fields) {
      if (!field.name) continue
      if (phase === 'beforeValidate' && field.access?.create && !await field.access.create({ req, data })) delete data[field.name]
      let value = data[field.name] ?? field.defaultValue
      for (const hook of field.hooks?.[phase] || []) value = await hook({ ...args(), value, siblingData: data, field })
      if (value !== undefined) data[field.name] = value
    }
    for (const hook of collection.hooks?.[phase] || []) data = await hook(args()) || data
  }
  const doc = { id: 'created_marker', ...data }
  for (const hook of collection.hooks?.afterChange || []) await hook({ ...args(), doc, previousDoc: {} })
  return doc
}
module.exports = { calls, stripe, stubs, load, config, user, request, invoke, create }
