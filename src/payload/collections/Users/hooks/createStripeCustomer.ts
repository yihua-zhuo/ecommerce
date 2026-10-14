import type { BeforeChangeHook } from 'payload/dist/collections/config/types'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2022-08-01',
})

export const createStripeCustomer: BeforeChangeHook = async ({ req, data, operation }) => {
  if (operation === 'create' && !data.stripeCustomerID) {
    try {
      // create a new customer and assign the ID to the user
      const customer = await stripe.customers.create({
        email: data.email,
      })

      return {
        ...data,
        stripeCustomerID: customer.id,
      }
    } catch (error: unknown) {
      req.payload.logger.error(`Error creating Stripe customer: ${error}`)
    }
  }

  return data
}
