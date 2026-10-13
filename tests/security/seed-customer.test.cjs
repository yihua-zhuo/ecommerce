const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const fs = require('node:fs')
const path = require('node:path')

// Load the real application configuration and its handlers, without starting
// MongoDB, Stripe, the admin browser bundle, or an HTTP listener.
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', jsx: 'react' },
})

test('a customer cannot reset the production storefront through /api/seed', async () => {
  process.env.NODE_ENV = 'production'
  process.env.STRIPE_SECRET_KEY = 'sk_test_security_regression'
  delete process.env.PAYLOAD_SEED
  delete process.env.PAYLOAD_DROP_DATABASE

  const originalLoad = Module._load
  const originalScss = require.extensions['.scss']
  const identityPlugin = () => config => config
  const frameworkStubs = {
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
  Module._load = function (name, parent, isMain) {
    if (Object.hasOwn(frameworkStubs, name)) return frameworkStubs[name]
    // Browser-only framework widgets are never rendered by this test.
    if (name.startsWith('payload/components') ||
        name.startsWith('payload/dist/admin/components/') ||
        name.startsWith('@payloadcms/richtext-slate/dist/field/')) return {}
    return originalLoad.call(this, name, parent, isMain)
  }
  require.extensions['.scss'] = () => {}

  let config
  try {
    config = await require('../../src/payload/payload.config').default
  } finally {
    Module._load = originalLoad
    if (originalScss) require.extensions['.scss'] = originalScss
    else delete require.extensions['.scss']
  }

  // Removal of the production endpoint is also a valid remediation.
  const routes = (config.endpoints || []).filter(endpoint => endpoint.path === '/seed')
  const customer = {
    id: 'customer-marker', collection: 'users',
    email: 'customer@example.invalid', roles: ['customer'],
  }
  const effects = []
  const storefront = { title: 'live-storefront-marker' }
  const initialStorefront = { ...storefront }
  let nextID = 0
  // This is the injected Payload framework API, not a replacement for any
  // application handler or seed function. All application code runs unchanged.
  const payload = {
    config,
    db: { defaultIDType: 'text' },
    logger: { info() {}, error() {}, warn() {} },
    find: async () => ({ docs: [storefront], totalDocs: 1 }),
    findByID: async ({ collection }) => collection === 'users' ? customer : storefront,
    findGlobal: async () => storefront,
    delete: async args => {
      effects.push(`delete ${args.collection}`)
      delete storefront.title
      return { docs: [], errors: [] }
    },
    create: async args => {
      effects.push(`create ${args.collection}`)
      return { ...args.data, id: `demo-${++nextID}` }
    },
    update: async args => {
      effects.push(`update ${args.collection}`)
      return { ...args.data, id: args.id }
    },
    updateGlobal: async args => {
      effects.push(`update global ${args.slug}`)
      return args.data
    },
  }

  const originalExists = fs.existsSync
  const originalRmdir = fs.rmdirSync
  const originalRm = fs.rmSync
  const mediaDirectory = path.resolve(__dirname, '../../src/media')
  fs.existsSync = file => path.resolve(String(file)) === mediaDirectory || originalExists(file)
  fs.rmdirSync = file => { effects.push(`remove directory ${file}`) }
  fs.rmSync = file => { effects.push(`remove ${file}`) }
  try {
    for (const route of routes) {
      const req = {
        user: customer, payload, method: route.method.toUpperCase(),
        path: '/seed', url: '/api/seed', originalUrl: '/api/seed',
        headers: {}, query: {}, params: {}, body: {}, context: {},
        get(name) { return this.headers[name.toLowerCase()] },
      }
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this },
        json(body) { this.body = body; return this },
        send(body) { this.body = body; return this },
        end() { return this },
        sendStatus(code) { this.statusCode = code; return this },
      }
      let error
      try {
        await route.handler(req, res, err => { error = err })
      } catch (err) {
        error = err
      }
      // Check effects first: even a denied response must not follow deletion.
      assert.deepEqual(effects, [], 'Customer request must not alter storefront data or media')
      assert.deepEqual(storefront, initialStorefront, 'Live storefront marker must survive')
      const status = error ? (error.status || error.statusCode) : res.statusCode
      assert.ok([401, 403, 404, 405, 410].includes(status),
        `Customer seed request must be refused or unavailable; received ${status}`)
    }
  } finally {
    fs.existsSync = originalExists
    fs.rmdirSync = originalRmdir
    fs.rmSync = originalRm
  }
})
