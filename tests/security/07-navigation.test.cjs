const { test } = require('node:test')
const assert = require('node:assert/strict')
const { config, context, mutate } = require('./support.cjs')

test('a customer cannot publish site-wide navigation changes', async () => {
  for (const slug of ['header', 'footer', 'settings']) {
    const global = config.globals.find(g => g.slug === slug)
    const data = slug === 'settings' ? { productsPage: 'marker-page' } : {
      navItems: [{ link: { type: 'custom', label: 'Marker', url: 'https://other.example/marker' } }],
    }
    const original = slug === 'settings' ? { productsPage: 'original-page' } : { navItems: [] }
    const result = await mutate(global, 'update', data, context(), original)
    assert.deepEqual(result.doc, original, `customer modified the shared ${slug}`)
  }
})

test('custom navigation never renders an executable URL scheme', async () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  require('mock-require')('next/link', ({ href, children, ...props }) =>
    React.createElement('a', { ...props, href }, children))
  const { CMSLink } = require('../../src/app/_components/Link/index.tsx')
  const ctx = context({ id: 'admin', roles: ['admin'] })
  const header = config.globals.find(g => g.slug === 'header')
  // A no-op scheme marker is only rendered to text, never clicked or executed.
  const result = await mutate(header, 'update', {
    navItems: [{ link: { type: 'custom', label: 'Marker', url: 'javascript:void(0)' } }],
  }, ctx, { navItems: [] })
  if (result.rejected) return
  for (const item of result.doc.navItems || []) {
    const html = renderToStaticMarkup(React.createElement(CMSLink, item.link))
    assert.doesNotMatch(html, /href=["']\s*javascript:/i,
      'CMS navigation rendered an executable URL scheme')
  }
})
