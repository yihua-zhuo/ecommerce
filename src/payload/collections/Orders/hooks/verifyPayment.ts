import { APIError } from 'payload/errors'
import type { BeforeValidateHook } from 'payload/dist/collections/config/types'
import Stripe from 'stripe'

import { checkRole } from '../../Users/checkRole'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2022-08-01',
})

export const verifyPayment: BeforeValidateHook = async ({ req, data, operation }) => {
  if (operation !== 'create' || checkRole(['admin'], req.user)) return data
  if (!req.user || typeof data?.stripePaymentIntentID !== 'string') {
    throw new APIError('A paid payment intent is required', 403)
  }

  const user = await req.payload.findByID({ collection: 'users', id: req.user.id })
  const payment = await stripe.paymentIntents.retrieve(data.stripePaymentIntentID)
  if (payment.status !== 'succeeded' || payment.customer !== user.stripeCustomerID ||
      payment.metadata?.userID !== String(user.id) || payment.currency !== 'usd') {
    throw new APIError('Payment is not completed or does not belong to you', 403)
  }

  const count = Number(payment.metadata.itemCount)
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new APIError('Invalid payment items', 400)
  }
  const items = []
  for (let index = 0; index < count; index++) {
    let item
    try {
      item = JSON.parse(payment.metadata[`item_${index}`])
    } catch (_) {
      throw new APIError('Invalid payment items', 400)
    }
    if (typeof item?.product !== 'string' || !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 100 || !Number.isSafeInteger(item.price) ||
        item.price <= 0) {
      throw new APIError('Invalid payment items', 400)
    }
    items.push({ product: item.product, quantity: item.quantity, price: item.price })
  }
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  if (total !== payment.amount || total !== payment.amount_received) {
    throw new APIError('Payment amount does not match the order', 400)
  }

  return { ...data, orderedBy: user.id, items, total }
}
