import { createHash } from 'crypto'
import type { PayloadHandler } from 'payload/config'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2022-08-01',
})

const checkoutRequests = new Map<string, number>()

export const createPaymentIntent: PayloadHandler = async (req, res): Promise<void> => {
  const { user, payload } = req

  if (!user) {
    res.status(401).send('Unauthorized')
    return
  }

  const now = Date.now()
  checkoutRequests.forEach((expires, id) => {
    if (expires <= now) checkoutRequests.delete(id)
  })
  const userID = String(user.id)
  if (checkoutRequests.has(userID) || checkoutRequests.size >= 10000) {
    res.status(429).json({ error: 'Please wait before retrying checkout' })
    return
  }
  checkoutRequests.set(userID, Infinity)

  try {
    const fullUser = await payload.findByID({ collection: 'users', id: user.id })
    const items = fullUser?.cart?.items
    if (!items?.length || items.length > 20 ||
        items.some(item => !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 || item.quantity > 100)) {
      res.status(400).json({ error: 'Cart requires 1–20 items with integer quantities from 1–100' })
      return
    }

    let stripeCustomerID = fullUser.stripeCustomerID
    if (!stripeCustomerID) {
      const customer = await stripe.customers.create({
        email: fullUser.email,
        name: fullUser.name,
      }, { idempotencyKey: `customer-${userID}` })
      stripeCustomerID = customer.id
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { stripeCustomerID },
      })
    }

    let total = 0
    const metadata: Record<string, string> = { userID, itemCount: String(items.length) }
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const productID = typeof item.product === 'string' ? item.product : item.product?.id
      if (!productID) throw new Error('Missing product')
      const product = await payload.findByID({ collection: 'products', id: productID })
      if (!product?.stripeProductID) throw new Error('Missing Stripe product')
      const prices = await stripe.prices.list({
        product: product.stripeProductID,
        active: true,
        type: 'one_time',
        limit: 1,
      })
      const price = prices.data[0]
      if (!price || price.currency !== 'usd' ||
          !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0) {
        throw new Error('Product has no valid price')
      }
      total += price.unit_amount * item.quantity
      metadata[`item_${index}`] = JSON.stringify({
        product: productID, quantity: item.quantity, price: price.unit_amount,
      })
    }

    if (!Number.isSafeInteger(total) || total <= 0 || total > 99999999) {
      throw new Error('Invalid checkout total')
    }

    const paymentData = {
      customer: stripeCustomerID,
      amount: total,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata,
    }
    const key = createHash('sha256')
      .update(JSON.stringify(paymentData))
      .update(String(Math.floor(now / 600000)))
      .digest('hex')
    const paymentIntent = await stripe.paymentIntents.create(paymentData, {
      idempotencyKey: `checkout-${key}`,
    })

    res.send({ client_secret: paymentIntent.client_secret })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    payload.logger.error(message)
    res.status(400).json({ error: message })
  } finally {
    checkoutRequests.set(userID, Date.now() + 10000)
  }
}
