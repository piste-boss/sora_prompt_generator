import { createStore } from './_lib/store.js'

export const config = {
  blobs: true,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders,
  },
  body: JSON.stringify(payload),
})

const parseRecord = (value) => {
  if (!value) return null
  try {
    if (typeof value === 'string') return JSON.parse(value)
    return value
  } catch {
    return null
  }
}

const isActiveStatus = (record) => {
  if (!record) return false
  const status = String(record.status || '').toLowerCase()
  const nowSeconds = Date.now() / 1000
  const trialEnd = Number(record.trialEnd || record.trial_end || 0)
  const periodEnd = Number(record.currentPeriodEnd || record.current_period_end || 0)
  const latestEnd = Math.max(trialEnd || 0, periodEnd || 0)

  const statusAllows =
    status === 'active' || status === 'trialing' || status === 'past_due' || status === 'paid'

  if (!statusAllows) return false
  if (latestEnd && latestEnd < nowSeconds) {
    return false
  }
  return true
}

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    }
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'POSTメソッドのみ利用できます。' })
  }

  let payload = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch {
    return json(400, { message: 'JSON形式が正しくありません。' })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email) {
    return json(400, { message: 'メールアドレスが指定されていません。' })
  }

  try {
    const store = createStore('subscriptions', context)
    const stored = await store.get(`subscription:${email}`, { type: 'text' }).catch(() => null)
    const record = parseRecord(stored)
    const active = isActiveStatus(record)

    return json(200, {
      active,
      status: record?.status || 'none',
      plan: record?.plan || '',
      priceId: record?.priceId || '',
      trialEnd: record?.trialEnd || record?.trial_end || null,
      currentPeriodEnd: record?.currentPeriodEnd || record?.current_period_end || null,
      updatedAt: record?.updatedAt || null,
    })
  } catch (error) {
    console.error('[check-subscription] failed', error)
    return json(500, { message: 'サブスクリプションの確認に失敗しました。', error: error.message })
  }
}
