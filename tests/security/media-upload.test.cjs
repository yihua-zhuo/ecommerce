const test = require('node:test')
const assert = require('node:assert/strict')
const { load, request, write } = require('./support.cjs')

test('ordinary customers cannot publish active files in public media storage', async () => {
  const media = load('src/payload/collections/Media').Media
  const req = request()
  // Plain text marker: no script or executable payload is needed.
  req.files = { file: { name: 'marker.html', mimetype: 'text/html', size: 6, data: Buffer.from('marker') } }
  req.file = req.files.file
  const result = await write(media, 'create', req, { alt: 'marker' })
  assert.equal(result.refused, true, 'customer HTML upload must be refused before public storage')
})
