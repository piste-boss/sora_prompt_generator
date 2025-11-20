import Stripe from 'stripe'

const PRICE_MAP = {
  basic: process.env.PRICE_ID_BASIC_MONTHLY,
  pro: process.env.PRICE_ID_PRO_MONTHLY,
}

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS || 7) || 7

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY が設定されていません。')
  }
  return new Stripe(secretKey, { apiVersion: '2024-09-30' })
}

const buildBaseUrl = (event) => {
  const envUrl = process.env.URL || process.env.DEPLOY_URL || process.env.DEPLOY_PRIME_URL
  if (envUrl) return envUrl
  const host = event.headers?.host
  const protocol = event.headers?.['x-forwarded-proto'] || 'https'
  if (host) return `${protocol}://${host}`
  return 'http://localhost:8888'
}

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(payload),
})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'POSTメソッドのみ利用できます。' })
  }

  let body = {}
  try {
    body = event.body ? JSON.parse(event.body) : {}
  } catch {
    return json(400, { message: 'JSON形式が正しくありません。' })
  }

  const { plan = 'basic', priceId: rawPriceId, email } = body
  const priceId = typeof rawPriceId === 'string' && rawPriceId.trim() ? rawPriceId.trim() : PRICE_MAP[plan]
  if (!priceId) {
    return json(400, { message: '価格IDが指定されていません。PRICE_ID_BASIC_MONTHLY など環境変数を設定してください。' })
  }

  try {
    const stripe = getStripeClient()
    const baseUrl = buildBaseUrl(event)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          plan,
        },
      },
      allow_promotion_codes: true,
      customer_email: email || undefined,
      success_url: `${baseUrl}/login/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/user/?checkout=cancelled`,
      metadata: {
        plan,
        email: email || '',
      },
    })

    return json(200, { url: session.url })
  } catch (error) {
    console.error('[create-checkout] failed', error)
    return json(500, { message: 'チェックアウトの作成に失敗しました。', error: error.message })
  }
}
