const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, write, attempt } = require('./support.cjs')
const { Media } = require('../../src/payload/collections/Media')

test('anonymous callers cannot persist arbitrary file content on the media origin', async () => {
  const env = fixture()
  env.req.user = null
  env.records.media = []
  const bytes = Buffer.from('marker')
  env.req.file = { name: 'marker.txt', mimetype: 'text/plain', size: bytes.length, data: bytes }
  env.req.files = { file: env.req.file }
  const allowedTypes = Media.upload && Media.upload.mimeTypes
  // Payload enforces configured MIME restrictions before persisting an upload.
  const matches = pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test('text/plain')
  if (!allowedTypes || allowedTypes.some(matches)) {
    await attempt(() => write(Media, env, 'create', { alt: 'Upload marker', filename: 'marker.txt', mimeType: 'text/plain', filesize: bytes.length }))
  }
  assert.equal(env.records.media.length, 0,
    'An anonymous plain-text upload must be rejected by authorization or file validation')
})
