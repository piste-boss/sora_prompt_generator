import { getConfigStore } from './_lib/store.js'

const CONFIG_KEY = 'router-config'

const DEFAULT_SURVEY_RESULTS = {
  endpointUrl: '',
  apiKey: '',
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

const getSurveyConfig = async (context) => {
  const store = getConfigStore(context)
  const stored = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
  if (!stored || typeof stored !== 'object') {
    return DEFAULT_SURVEY_RESULTS
  }
  return {
    endpointUrl: stored.surveyResults?.endpointUrl || '',
    apiKey: stored.surveyResults?.apiKey || '',
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
    return jsonResponse(405, { message: 'Method Not Allowed' })
  }

  let payload
  try {
    payload = JSON.parse(event.body)
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON payload.' })
  }

  if (!payload || typeof payload !== 'object') {
    return jsonResponse(400, { message: 'Request body is required.' })
  }

  if (!payload.formKey) {
    return jsonResponse(400, { message: 'formKey is required.' })
  }

  if (!payload.answers || typeof payload.answers !== 'object') {
    return jsonResponse(400, { message: 'answers is required.' })
  }

  const metadata = typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {}
  const spreadsheetUrl = typeof metadata.spreadsheetUrl === 'string' ? metadata.spreadsheetUrl : ''
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

  if (!spreadsheetId) {
    return jsonResponse(400, { message: 'スプレッドシートURLの形式が正しくありません。' })
  }

  payload.metadata = {
    ...metadata,
    spreadsheetId,
    surveyResultsSpreadsheetId: spreadsheetId,
    surveyResultsSpreadsheetUrl: spreadsheetUrl,
  }
  console.log('survey-submit metadata:', payload.metadata)

  const surveyConfig = await getSurveyConfig(context)
  if (!surveyConfig.endpointUrl) {
    return jsonResponse(400, { message: '送信先APIが未設定です。' })
  }

  const headers = {
    'Content-Type': 'application/json',
  }
  if (surveyConfig.apiKey) {
    headers.Authorization = `Bearer ${surveyConfig.apiKey}`
  }

  let upstreamResponse
  let upstreamBody = ''
  try {
    upstreamResponse = await fetch(surveyConfig.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    upstreamBody = await upstreamResponse.text()
  } catch (error) {
    console.error('Failed to forward survey results:', error)
    return jsonResponse(502, { message: 'アンケート送信に失敗しました。' })
  }

  if (!upstreamResponse.ok) {
    console.error('Survey endpoint responded with error:', upstreamBody)
    return jsonResponse(502, {
      message: 'アンケート送信に失敗しました。時間をおいて再度お試しください。',
    })
  }

  return jsonResponse(200, { status: 'ok' })
}

const extractSpreadsheetId = (url) => {
  if (typeof url !== 'string' || !url) return ''
  const trimmed = url.trim()
  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/, // standard share URL
    /id=([a-zA-Z0-9-_]+)/, // query param
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  return ''
}
