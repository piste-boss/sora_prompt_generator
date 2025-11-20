import crypto from 'node:crypto'

import { createStore } from './_lib/store.js'

const CONFIG_KEY = 'router-config'
const PROFILE_SHEET_NAME = 'profiles'

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

const getStoredConfig = async (context) => {
  const store = createStore(undefined, context)
  const saved = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
  return saved || {}
}

const hashPassword = (value, salt = '') => {
  const password = typeof value === 'string' ? value : ''
  return crypto.createHash('sha256').update(`${password}${salt}`).digest('hex')
}

const getUserDataSettings = (config = {}) => {
  const defaults = {
    spreadsheetUrl: '',
    submitGasUrl: '',
    readGasUrl: '',
    passwordSalt: '',
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

  const email = sanitizeString(payload.email)
  const password = sanitizeString(payload.password)
  const userId = sanitizeString(payload.userId)
  const sheetName = sanitizeString(payload.sheetName) || PROFILE_SHEET_NAME

  if (!email) {
    return jsonResponse(400, { message: 'メールアドレスを入力してください。' })
  }

  if (!password) {
    return jsonResponse(400, { message: 'パスワードを入力してください。' })
  }

  const config = await getStoredConfig(context)
  const settings = getUserDataSettings(config)

  const overrideMetadata =
    typeof payload.metadata === 'object' && payload.metadata ? payload.metadata : {}

  const storedSpreadsheetUrl = sanitizeString(settings.spreadsheetUrl || overrideMetadata.spreadsheetUrl)
  let spreadsheetId = sanitizeString(overrideMetadata.spreadsheetId)
  if (!spreadsheetId && storedSpreadsheetUrl) {
    spreadsheetId = extractSpreadsheetId(storedSpreadsheetUrl)
  }
  if (!spreadsheetId && sanitizeString(settings.spreadsheetId)) {
    spreadsheetId = sanitizeString(settings.spreadsheetId)
  }

  if (!spreadsheetId) {
    return jsonResponse(400, { message: '店舗情報のスプレッドシートIDが取得できませんでした。' })
  }

  const readGasUrl = sanitizeString(settings.readGasUrl || overrideMetadata.readGasUrl)
  if (!readGasUrl) {
    return jsonResponse(400, { message: '店舗情報読み取りGAS URLが設定されていません。' })
  }

  const passwordSalt = sanitizeString(overrideMetadata.passwordSalt || settings.passwordSalt)
  const plainPassword = password
  const hashedPassword = hashPassword(password, passwordSalt)
  console.log('[user-data-read] request payload', {
    email,
    hashedPassword,
    sheetName,
    spreadsheetId,
  })

  const legacyRequestFields = {
    email,
    password: hashedPassword,
    userId,
    sheetName,
    spreadsheetId,
    spreadsheetUrl: storedSpreadsheetUrl,
  }

  const requestBodyPayload = {
    ...legacyRequestFields,
    hashedPassword,
    passwordHash: hashedPassword,
    passwordPlain: plainPassword,
    plainPassword,
    legacyPassword: plainPassword,
    profile: {
      email,
      password: hashedPassword,
    },
    metadata: {
      sheetName,
      spreadsheetId,
      spreadsheetUrl: storedSpreadsheetUrl,
      userId,
      passwordSalt,
      passwordPlain: plainPassword,
      passPlain: plainPassword,
    },
  }

  const requestBody = JSON.stringify(requestBodyPayload)

  try {
    const response = await fetch(readGasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    })

    const responseText = await response.text()
    let responsePayload = {}
    try {
      responsePayload = responseText ? JSON.parse(responseText) : {}
    } catch {
      responsePayload = {}
    }
    if (responsePayload && responsePayload.ok === false) {
      console.warn('[user-data-read] GAS responded with ok:false', {
        email,
        sheetName,
        spreadsheetId,
        response: responsePayload,
      })
    }

    if (!response.ok) {
      const message =
        responsePayload?.message ||
        responsePayload?.error ||
        '店舗情報の読み込みに失敗しました。時間を空けて再度お試しください。'
      console.error('user-data-read: GAS error', {
        status: response.status,
        statusText: response.statusText,
        body: responsePayload || responseText,
      })
      return jsonResponse(response.status >= 400 ? 502 : response.status, { message })
    }

    const profile =
      (responsePayload && typeof responsePayload.profile === 'object' && responsePayload.profile) ||
      (responsePayload &&
        typeof responsePayload.data === 'object' &&
        (responsePayload.data.profile || responsePayload.data)) ||
      null

    if (!profile) {
      return jsonResponse(502, { message: 'GASからユーザー情報を取得できませんでした。' })
    }

    return jsonResponse(200, {
      profile,
      metadata: {
        sheetName,
        spreadsheetId,
      },
      raw: responsePayload,
    })
  } catch (error) {
    console.error('user-data-read failed:', error)
    return jsonResponse(502, { message: '店舗情報の読み込み中にエラーが発生しました。' })
  }
}
