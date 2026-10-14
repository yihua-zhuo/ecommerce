const assert = require('node:assert/strict')
const test = require('node:test')
const h = require('./harness.cjs')
const { browser } = require('./browser-harness.cjs')
test('visiting confirmation without an order leaves the customer cart intact', async () => {
  const account = h.user()
  account.cart.items = [{ product: { id: 'product_marker', priceJSON: '{"data":[{"unit_amount":1000}]}' }, quantity: 1 }]
  const b = browser(account)
  const { AuthProvider } = h.load('src/app/_providers/Auth')
  const { CartProvider } = h.load('src/app/_providers/Cart')
  const { OrderConfirmationPage } = h.load('src/app/(pages)/order-confirmation/OrderConfirmationPage')
  const tree = page => b.react.createElement(AuthProvider, {}, b.react.createElement(CartProvider, {}, page))
  await b.settle(tree(null))
  b.events.length = 0
  await b.settle(tree(b.react.createElement(OrderConfirmationPage, {})))
  const destructive = b.events.filter(e => e.method === 'PATCH' && JSON.parse(e.body || '{}').cart?.items?.length === 0)
  assert.equal(destructive.length, 0, 'Unverified confirmation visit must not persist an empty cart')
})
