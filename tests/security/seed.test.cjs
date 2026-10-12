const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { customer, logger } = require('./support.cjs')
const { seed } = require('../../src/payload/endpoints/seed')

test('storefront seeding refuses ordinary customers before any destructive effect', async t => {
  const effects = []
  // Stub at the filesystem boundary so no real media can be removed.
  t.mock.method(fs, 'existsSync', () => false)
  t.mock.method(fs, 'rmdirSync', () => { effects.push('remove media') })
  t.mock.method(fs, 'rmSync', () => { effects.push('remove media') })
  const payload = {
    logger, db: { defaultIDType: 'text' },
    delete: async () => { effects.push('delete collection'); return {} },
    updateGlobal: async () => { effects.push('replace global'); return {} },
    create: async () => { effects.push('create record'); return { id: 'fixture' } },
    update: async () => { effects.push('update record'); return { id: 'fixture' } },
  }
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }, send(body) { this.body = body; return this }, end() {} }
  await seed({ user: customer, payload, headers: {}, context: {} }, res)
  assert.deepEqual(effects, [], 'A customer request must not erase or reseed storefront data')
  assert.ok(res.statusCode >= 400 && res.statusCode < 500, 'The endpoint must refuse the customer')
})
