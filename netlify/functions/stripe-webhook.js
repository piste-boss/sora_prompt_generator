import Stripe from 'stripe'

import { createStore } from './_lib/store.js'

export const config = {
  bodyParser: false,
  blobs: true,
}

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
})

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY が設定されていません。')
  }
  return new Stripe(secretKey, { apiVersion: '2024-09-30' })
}

const validateSignature = (event) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET が設定されていません。')
  }
  const stripe = getStripeClient()
  const signature = event.headers['stripe-signature']
  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8')
  return stripe.webhooks.constructEvent(bodyBuffer, signature, webhookSecret)
}

const serializeSubscription = (source, statusOverride) => {
  if (!source) return null
  const subscription = source.subscription || source
  const customerId = source.customer || subscription?.customer
  const email =
    source.customer_details?.email ||
    source.customer_email ||
    subscription?.customer_email ||
    ''
  const priceId =
    subscription?.items?.data?.[0]?.price?.id ||
    source?.plan?.id ||
    source?.metadata?.priceId ||
    ''

  const status = statusOverride || subscription?.status || 'active'
  const trialEnd = subscription?.trial_end || source.trial_end || null
  const currentPeriodEnd = subscription?.current_period_end || null
  return {
    email,
    customerId,
    subscriptionId: typeof subscription === 'object' ? subscription.id : subscription,
    priceId,
    status,
    trialEnd,
    currentPeriodEnd,
    plan: source.metadata?.plan || subscription?.metadata?.plan || '',
    updatedAt: new Date().toISOString(),
  }
}

const saveSubscription = async (record, context) => {
  if (!record) return
  const key = record.email ? `subscription:${record.email}` : `customer:${record.customerId || 'unknown'}`
  const store = createStore('subscriptions', context)
  await store.set(key, JSON.stringify(record))
}

export const handler = async (event, context) => {
  try {
    const stripeEvent = validateSignature(event)
    const type = stripeEvent.type
    let payload = null

    if (type === 'checkout.session.completed') {
      const session = stripeEvent.data.object
      payload = serializeSubscription(session)
    } else if (type === 'invoice.payment_succeeded' || type === 'invoice.paid') {
      const invoice = stripeEvent.data.object
      payload = serializeSubscription(invoice, invoice.status)
    } else if (type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object
      payload = serializeSubscription(subscription, 'canceled')
    }

    if (payload) {
      await saveSubscription(payload, context)
    }

    return {
      statusCode: 200,
      body: 'ok',
    }
  } catch (error) {
    console.error('[stripe-webhook] error', error)
    return json(400, { message: 'Webhook 処理に失敗しました。', error: error.message })
  }
}
