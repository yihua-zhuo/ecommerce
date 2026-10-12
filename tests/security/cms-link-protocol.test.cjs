const test = require('node:test')
const assert = require('node:assert/strict')

// Match the bundler's handling of styles while retaining the real components
// and the real React/Next link renderer.
require.extensions['.scss'] = module => { module.exports = {} }
require('ts-node').register({ transpileOnly: true, compilerOptions: { jsx: 'react' } })
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { CMSLink } = require('../../src/app/_components/Link')
const { Button } = require('../../src/app/_components/Button')
const RichText = require('../../src/app/_components/RichText').default

function destinations(html) {
  return [...html.matchAll(/\bhref\s*=\s*"([^"]*)"/gi)].map(match =>
    match[1].replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (_, code) =>
      String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
      .replace(/&colon;/gi, ':').replace(/&amp;/gi, '&'))
}

const renderers = {
  'navigation link': url => React.createElement(CMSLink, { type: 'custom', url, label: 'Marker' }),
  'styled CMS link': url => React.createElement(CMSLink, { type: 'custom', url, label: 'Marker', appearance: 'primary' }),
  'button link': href => React.createElement(Button, { href, label: 'Marker' }),
  'media caption link': url => React.createElement(RichText, { content: [
    { type: 'paragraph', children: [{ type: 'link', linkType: 'custom', url, children: [{ text: 'Marker' }] }] },
  ] }),
}

for (const [name, element] of Object.entries(renderers)) {
  test(`${name} never emits a JavaScript destination`, () => {
    const safe = '/products/marker'
    assert.ok(destinations(renderToStaticMarkup(element(safe))).includes(safe),
      'Ordinary storefront links must still work')
    // Harmless expression only; it is inspected as markup and never executed.
    const html = renderToStaticMarkup(element('javascript:void(0)'))
    const unsafe = destinations(html).filter(href =>
      /^javascript:/i.test(href.replace(/[\u0000-\u0020\u007f]/g, '')))
    assert.deepEqual(unsafe, [], 'CMS content must not render a clickable JavaScript URL')
  })
}
