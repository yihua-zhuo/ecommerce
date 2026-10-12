const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { logger } = require('./support.cjs')

test('a cross-site GET with an administrator cookie cannot reseed the database', async t => {
  // Read the declarative route registration without booting MongoDB or webpack.
  const source = ts.createSourceFile('payload.config.ts', fs.readFileSync(path.join(__dirname, '../../src/payload/payload.config.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
  let getRegistered = false
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source).replace(/['"]/g, ''), p.initializer.getText(source).replace(/^['"]|['"]$/g, '')]))
      if (properties.path === '/seed' && properties.method?.toLowerCase() === 'get') getRegistered = true
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!getRegistered) return // Removing the GET route prevents this CSRF vector.
  const { seed } = require('../../src/payload/endpoints/seed')
  const effects = []
  t.mock.method(fs, 'existsSync', () => false)
  t.mock.method(fs, 'rmdirSync', () => { effects.push('remove media') })
  t.mock.method(fs, 'rmSync', () => { effects.push('remove media') })
  const payload = { logger, db: { defaultIDType: 'text' },
    delete: async () => { effects.push('delete records'); return {} },
    updateGlobal: async () => { effects.push('replace global'); return {} },
    create: async () => { effects.push('create record'); return { id: 'fixture' } },
    update: async () => { effects.push('update record'); return { id: 'fixture' } },
  }
  const res = { status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this }, send(body) { this.body = body; return this }, end() {} }
  await seed({ method: 'GET', user: { id: '000000000000000000000001', roles: ['admin'] },
    payload, body: {}, query: {}, context: {}, headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
    get(name) { return this.headers[name.toLowerCase()] },
  }, res)
  assert.deepEqual(effects, [], 'Ambient administrator cookies on a GET must not authorize destructive seeding')
})
