const { test } = require('node:test')
const assert = require('node:assert/strict')
const { collection, context, allowed } = require('./support.cjs')

test('customers cannot upload, overwrite, or delete shared storefront media', async () => {
  const media = collection('media')
  const ctx = context()
  const doc = { id: 'shared-media', alt: 'marker', mimeType: 'text/html' }
  ctx.req.files = { file: { name: 'marker.html', mimetype: 'text/html', data: Buffer.from('marker'), size: 6 } }
  for (const operation of ['create', 'update', 'delete']) {
    assert.equal(await allowed(media.access?.[operation],
      { req: ctx.req, id: doc.id, data: doc }, doc), false,
      `customer is authorized to ${operation} shared media`)
  }
})
