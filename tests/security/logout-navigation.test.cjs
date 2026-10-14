const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
const { browser } = require('./browser-harness.cjs')
test('visiting logout without interacting preserves the authenticated session', async () => {
  const b = browser(h.user())
  const { AuthProvider } = h.load('src/app/_providers/Auth')
  const { LogoutPage } = h.load('src/app/(pages)/logout/LogoutPage')
  const tree = page => b.react.createElement(AuthProvider, {}, page)
  await b.settle(tree(null))
  b.events.length = 0
  await b.settle(tree(b.react.createElement(LogoutPage, { settings: {} })))
  assert.equal(b.events.filter(e => e.url.endsWith('/api/users/logout') && e.method === 'POST').length, 0, 'Passive logout visit must not terminate the session')
})
