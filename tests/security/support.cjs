// Contract harness for Payload's public configuration callbacks. No application
// exports are replaced. Stripe and request-scoped persistence are test doubles.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

process.env.STRIPE_SECRET_KEY = 'sk_test_security_marker'
process.env.PAYLOAD_SECRET = 'security-regression-test-secret'
process.env.DATABASE_URI = 'mongodb://unused.invalid/security'
process.env.PAYLOAD_PUBLIC_SERVER_URL = 'http://store.invalid'
process.env.NEXT_PUBLIC_SERVER_URL = 'http://store.invalid'

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React, esModuleInterop: true }, fileName: filename,
    })
    module._compile(result.outputText, filename)
  }
}
for (const ext of ['.css', '.scss']) require.extensions[ext] = () => {}

const stripe = { prices: [], intents: [], existingCustomers: [] }
class Stripe {
  customers = {
    list: async () => ({ data: stripe.existingCustomers }),
    create: async () => ({ id: 'cus_new_account' }),
    retrieve: async id => ({ id }),
  }
  prices = { list: async args => {
    stripe.prices.push(args)
    return { data: [{ id: 'price_marker', unit_amount: 100, currency: 'usd' }] }
  } }
  paymentIntents = {
    create: async args => {
      stripe.intents.push(args)
      return { id: 'pi_marker', client_secret: 'secret_marker', ...args }
    },
    retrieve: async id => ({ id, status: 'requires_payment_method', customer: 'cus_other_account' }),
  }
}
const originalLoad = Module._load
Module._load = function (name, parent, main) {
  if (name === 'stripe') return Stripe
  // Admin rendering is outside these server-side contracts.
  if (name.startsWith('payload/components') || name.startsWith('payload/dist/admin/components/')) {
    return new Proxy(function () {}, { get: (_, key) => key === '__esModule' ? false : function () {} })
  }
  return originalLoad.call(this, name, parent, main)
}

const load = relative => require(path.resolve(__dirname, '../../', relative))
const customer = { id: '000000000000000000000001', roles: ['customer'], email: 'marker@example.invalid' }
const productID = '000000000000000000000002'
const admin = { id: '000000000000000000000003', roles: ['admin'] }
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
function matches(where, doc) {
  if (typeof where === 'boolean') return where
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return condition.every(item => matches(item, doc))
    if (key === 'or') return condition.some(item => matches(item, doc))
    const value = key.split('.').reduce((v, part) => v?.[part], doc)
    return Object.entries(condition).every(([op, wanted]) => {
      if (op === 'equals') return value === wanted
      if (op === 'not_equals') return value !== wanted
      if (op === 'in') return wanted.includes(value)
      if (op === 'not_in') return !wanted.includes(value)
      if (op === 'exists') return (value !== undefined) === wanted
      throw new Error(`Unsupported query operator: ${op}`)
    })
  })
}
function request(user = customer, records = {}) {
  const effects = []
  const payload = {
    logger: { info() {}, error() {}, warn() {} }, db: { defaultIDType: 'text' },
    find: async ({ collection }) => ({ docs: clone(records[collection] || []), totalDocs: (records[collection] || []).length }),
    findByID: async ({ collection, id }) => clone((records[collection] || []).find(doc => doc.id === id)),
    login: async () => ({ user: clone(user), token: 'test-token' }),
    update: async args => {
      effects.push({ operation: 'update', ...clone(args) })
      const doc = (records[args.collection] || []).find(doc => doc.id === args.id)
      if (doc) Object.assign(doc, clone(args.data))
      return clone(doc)
    },
    delete: async args => { effects.push({ operation: 'delete', ...args }); return { docs: [] } },
    updateGlobal: async args => { effects.push({ operation: 'updateGlobal', ...args }); return args.data },
    create: async args => { effects.push({ operation: 'create', ...args }); return { id: productID, ...args.data } },
  }
  return { user, payload, effects, context: {}, headers: {}, body: {}, query: {} }
}
async function access(config, operation, req, data, doc = {}) {
  const fn = config.access?.[operation]
  return matches(fn ? await fn({ req, data, id: doc.id }) : Boolean(req.user), doc)
}
class Refused extends Error {}
async function hooks(list, args, key) {
  for (const hook of list || []) {
    const result = await hook(args)
    if (result !== undefined) args[key] = result
  }
  return args[key]
}
// Invoke declared field access, hooks, constraints and validators recursively.
async function fields(list, data, original, args) {
  for (const field of list || []) {
    if (field.tabs) for (const tab of field.tabs) await fields(tab.fields, data, original, args)
    if (!field.name) { if (field.fields) await fields(field.fields, data, original, args); continue }
    const name = field.name
    const fieldArgs = { ...args, data: args.data, siblingData: data, originalDoc: original,
      siblingDoc: original, value: data[name], field, path: name }
    if (field.access?.[args.operation] && !await field.access[args.operation](fieldArgs)) {
      if (original[name] === undefined) delete data[name]
      else data[name] = clone(original[name])
    }
    if (data[name] === undefined && args.operation === 'create' && field.defaultValue !== undefined) {
      data[name] = typeof field.defaultValue === 'function' ? await field.defaultValue(fieldArgs) : clone(field.defaultValue)
    }
    fieldArgs.value = data[name]
    data[name] = await hooks(field.hooks?.beforeValidate, fieldArgs, 'value')
    data[name] = await hooks(field.hooks?.beforeChange, { ...fieldArgs, value: data[name] }, 'value')
    if (data[name] === undefined) continue
    if (field.maxRows !== undefined && data[name]?.length > field.maxRows) throw new Refused('Too many rows')
    if (field.min !== undefined && data[name] < field.min) throw new Refused('Below minimum')
    if (field.max !== undefined && data[name] > field.max) throw new Refused('Above maximum')
    if (field.validate) {
      const valid = await field.validate(data[name], { ...fieldArgs, ...field, value: data[name] })
      if (valid !== true && valid !== undefined) throw new Refused(String(valid))
    }
    if (field.type === 'group') await fields(field.fields, data[name], original[name] || {}, args)
    if (field.type === 'array') for (const row of data[name] || []) await fields(field.fields, row, {}, args)
  }
}
async function write(config, operation, req, input, original = {}) {
  let data = clone(input)
  req.body = clone(input)
  if (!await access(config, operation, req, data, original)) return { refused: true, doc: clone(original) }
  try {
    const args = { req, operation, data, originalDoc: original, context: req.context, overrideAccess: false }
    await hooks(config.hooks?.beforeOperation, { args, operation, req }, 'args')
    const file = req.files?.file || req.file
    if (file && config.upload?.mimeTypes?.length) {
      const allowed = config.upload.mimeTypes.some(pattern => pattern === file.mimetype ||
        (pattern.endsWith('/*') && file.mimetype.startsWith(pattern.slice(0, -1))))
      if (!allowed) return { refused: true, doc: clone(original) }
    }
    data = await hooks(config.hooks?.beforeValidate, args, 'data')
    await fields(config.fields, data, original, { ...args, data })
    data = await hooks(config.hooks?.beforeChange, { ...args, data }, 'data')
    let doc = { ...clone(original), ...data }
    doc = await hooks(config.hooks?.afterChange, { ...args, data, doc, previousDoc: original }, 'doc')
    return { refused: false, doc }
  } catch (error) {
    if (error instanceof Refused || [400, 401, 403, 422].includes(error.status || error.statusCode)) return { refused: true, doc: clone(original) }
    throw error
  }
}
function response() {
  return { statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    send(body) { this.body = body; return this },
  }
}
module.exports = { load, customer, admin, productID, request, response, access, write, matches, stripe }
