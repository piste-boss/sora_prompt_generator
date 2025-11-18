import { createStore } from './_lib/store.js'

const CONFIG_KEY = 'router-config'

export const config = {
  blobs: true,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

const jsonResponse = (statusCode, payload = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders,
  },
  body: JSON.stringify(payload),
})

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '')
const toBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'on', 'yes'].includes(normalized)
  }
  return false
}

const extractSpreadsheetId = (url) => {
  if (typeof url !== 'string' || !url) return ''
  const trimmed = url.trim()
  const patterns = [/\/d\/([a-zA-Z0-9-_]+)/, /[?&]id=([a-zA-Z0-9-_]+)/]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  return ''
}

const normalizeReferencePrompts = (entries, fallback = '') => {
  const normalized = Array.isArray(entries)
    ? entries
        .map((entry, index) => {
          const body = sanitizeString(entry?.body)
          if (!body) return null
          return {
            id: sanitizeString(entry?.id) || `ref-${index + 1}`,
            title: sanitizeString(entry?.title),
            body,
          }
        })
        .filter(Boolean)
    : []

  if (normalized.length > 0) {
    return normalized
  }

  const fallbackBody = sanitizeString(fallback)
  if (!fallbackBody) {
    return []
  }

  return [
    {
      id: 'ref-primary',
      title: '参考プロンプト',
      body: fallbackBody,
    },
  ]
}

const createReferencePromptsSummary = (entries) =>
  entries
    .map((entry, index) => {
      const label = entry.title || `参考プロンプト${index + 1}`
      return `${label}\n${entry.body}`
    })
    .join('\n\n-----\n\n')

const getStoredConfig = async (context) => {
  const store = createStore(undefined, context)
  const saved = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
  return saved || {}
}

const getUserDataSettings = (config = {}) => {
  const defaults = {
    spreadsheetUrl: '',
    submitGasUrl: '',
    readGasUrl: '',
  }
  return {
    ...defaults,
    ...(config.userDataSettings || {}),
  }
}

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    }
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { message: 'POSTメソッドのみ利用できます。' })
  }

  let payload = {}
  if (event.body) {
    try {
      payload = JSON.parse(event.body)
    } catch {
      return jsonResponse(400, { message: 'JSON形式が正しくありません。' })
    }
  }

  if (!payload || typeof payload !== 'object') {
    return jsonResponse(400, { message: 'リクエストボディが空です。' })
  }

  if (!payload.profile || typeof payload.profile !== 'object') {
    return jsonResponse(400, { message: 'profile が不足しています。' })
  }

  const config = await getStoredConfig(context)
  const settings = getUserDataSettings(config)

  const overrideMetadata = typeof payload.metadata === 'object' && payload.metadata ? payload.metadata : {}

  const submitGasUrl = sanitizeString(settings.submitGasUrl || overrideMetadata.submitGasUrl)
  const storedSpreadsheetUrl = sanitizeString(settings.spreadsheetUrl || overrideMetadata.spreadsheetUrl)

  let spreadsheetId = sanitizeString(overrideMetadata.spreadsheetId)
  if (!spreadsheetId && storedSpreadsheetUrl) {
    spreadsheetId = extractSpreadsheetId(storedSpreadsheetUrl)
  }
  if (!spreadsheetId && sanitizeString(settings.spreadsheetId)) {
    spreadsheetId = sanitizeString(settings.spreadsheetId)
  }

  if (!submitGasUrl) {
    return jsonResponse(400, { message: '店舗情報保存GASエンドポイントが設定されていません。' })
  }

  if (!spreadsheetId) {
    return jsonResponse(400, { message: '店舗情報のスプレッドシートIDが取得できませんでした。' })
  }

  const requestedUserId = sanitizeString(
    overrideMetadata.userId ?? payload.profile?.userId ?? config.userProfile?.userId ?? '',
  )
  const shouldCreateUserSheet = Boolean(toBooleanFlag(overrideMetadata.createUserSheet) && requestedUserId)
  const profileAdminEmail = sanitizeString(payload.profile?.admin?.email)
  const referencePrompts = normalizeReferencePrompts(
    payload.profile?.referencePrompts,
    payload.profile?.referencePrompt,
  )
  const primaryReferencePrompt = referencePrompts[0]?.body || sanitizeString(payload.profile?.referencePrompt)
  const referencePromptsSummary = referencePrompts.length > 0 ? createReferencePromptsSummary(referencePrompts) : ''
  const referencePromptsJson = JSON.stringify(referencePrompts)

  const metadata = {
    spreadsheetId, // 互換
    spreadsheetUrl: storedSpreadsheetUrl,
    userDataSpreadsheetId: spreadsheetId,
    userDataSpreadsheetUrl: storedSpreadsheetUrl,
    readGasUrl: sanitizeString(settings.readGasUrl || overrideMetadata.readGasUrl),
    apiKey: sanitizeString(overrideMetadata.apiKey),
    origin: sanitizeString(payload.origin),
    source: sanitizeString(payload.source) || 'user-app',
    submittedAt: sanitizeString(payload.submittedAt) || new Date().toISOString(),
    userId: requestedUserId,
    userSheetName: requestedUserId,
    userEmail: profileAdminEmail,
    createUserSheet: shouldCreateUserSheet,
    referencePrompt: primaryReferencePrompt,
    referencePromptCount: referencePrompts.length,
    referencePrompts,
    referencePromptsJson,
    referencePromptsSummary,
  }

  const profilePayload = {
    ...payload.profile,
    referencePrompts,
    referencePrompt: primaryReferencePrompt,
    referencePromptsSummary,
    referencePromptsJson,
    referencePromptCount: referencePrompts.length,
  }

  const requestBody = JSON.stringify({ profile: profilePayload, metadata })

  try {
    const response = await fetch(submitGasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    })

    if (!response.ok) {
      let errorPayload = null
      let errorText = ''
      try {
        errorText = await response.text()
        errorPayload = JSON.parse(errorText)
      } catch {
        // noop
      }
      console.error('user-data-submit: GAS error', {
        status: response.status,
        statusText: response.statusText,
        body: errorPayload || errorText,
      })
      const message =
        (errorPayload && (errorPayload.message || errorPayload.error)) ||
        (errorText && typeof errorText === 'string' ? errorText : '') ||
        '店舗情報の保存に失敗しました。'
      return jsonResponse(response.status >= 400 ? 502 : response.status, { message })
    }

    return jsonResponse(200, { status: 'ok' })
  } catch (error) {
    console.error('user-data-submit failed:', error)
    return jsonResponse(502, { message: '店舗情報の送信中にエラーが発生しました。' })
  }
}
