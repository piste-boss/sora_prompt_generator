import { getConfigStore } from './_lib/store.js'

const CONFIG_KEY = 'router-config'

export const config = {
  blobs: true,
}

const DEFAULT_PROMPTS = {
  page1: { gasUrl: '', prompt: '' },
  page2: { gasUrl: '', prompt: '' },
  page3: { gasUrl: '', prompt: '' },
}

const DEFAULT_ROUTER_DESCRIPTIONS = {
  beginner: {
    highlight: '所要時間 30秒',
    description: '5段階評価のみでひとこと生成',
  },
  intermediate: {
    highlight: '所要時間 60秒',
    description: '選択式のアンケートに答えて100文字程度の文章生成',
  },
  advanced: {
    highlight: '所要時間 90秒',
    description: 'アンケートに文章回答して200文字程度の文章生成',
  },
}

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '')

const DEFAULT_CONFIG = {
  labels: {
    beginner: '初級',
    intermediate: '中級',
    advanced: '上級',
  },
  tiers: {
    beginner: { links: [], nextIndex: 0 },
    intermediate: { links: [], nextIndex: 0 },
    advanced: { links: [], nextIndex: 0 },
  },
  aiSettings: {
    gasUrl: '',
    geminiApiKey: '',
    prompt: '',
    mapsLink: '',
    model: '',
  },
  prompts: DEFAULT_PROMPTS,
  branding: {
    faviconDataUrl: '',
    logoDataUrl: '',
  },
  routerDescriptions: DEFAULT_ROUTER_DESCRIPTIONS,
  updatedAt: null,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const jsonResponse = (statusCode, payload = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    ...corsHeaders,
  },
  body: JSON.stringify(payload),
})

const mergePrompts = (incoming = {}, fallback = DEFAULT_PROMPTS) =>
  Object.entries(DEFAULT_PROMPTS).reduce((acc, [key, defaults]) => {
    const incomingEntry = Object.prototype.hasOwnProperty.call(incoming, key) ? incoming[key] || {} : undefined
    const fallbackEntry = fallback[key] || defaults

    const gasUrl = Object.prototype.hasOwnProperty.call(incomingEntry || {}, 'gasUrl')
      ? sanitizeString(incomingEntry.gasUrl)
      : sanitizeString(fallbackEntry.gasUrl ?? defaults.gasUrl)

    const prompt = Object.prototype.hasOwnProperty.call(incomingEntry || {}, 'prompt')
      ? sanitizeString(incomingEntry.prompt)
      : sanitizeString(fallbackEntry.prompt ?? defaults.prompt)

    acc[key] = { gasUrl, prompt }
    return acc
  }, {})

const mergeRouterDescriptions = (
  incoming = {},
  fallback = DEFAULT_ROUTER_DESCRIPTIONS,
) =>
  Object.keys(DEFAULT_ROUTER_DESCRIPTIONS).reduce((acc, key) => {
    const incomingEntry = Object.prototype.hasOwnProperty.call(incoming || {}, key)
      ? incoming[key]
      : undefined
    const fallbackEntry = fallback?.[key] || DEFAULT_ROUTER_DESCRIPTIONS[key]
    acc[key] = {
      highlight: sanitizeString(incomingEntry?.highlight ?? fallbackEntry?.highlight ?? ''),
      description: sanitizeString(
        incomingEntry?.description ?? fallbackEntry?.description ?? '',
      ),
    }
    return acc
  }, {})

const mergeWithDefault = (config = {}, fallback = DEFAULT_CONFIG) => {
  const mergedLabels = {
    ...DEFAULT_CONFIG.labels,
    ...(fallback.labels || {}),
    ...(config.labels || {}),
  }

  const mergedTiers = Object.entries(DEFAULT_CONFIG.tiers).reduce((acc, [tierKey, defaults]) => {
    const storedTier = (config.tiers && config.tiers[tierKey]) || (fallback.tiers && fallback.tiers[tierKey]) || defaults
    const links = Array.isArray(storedTier.links) ? storedTier.links : []
    const nextIndex = Number.isInteger(storedTier.nextIndex) ? storedTier.nextIndex : 0
    acc[tierKey] = {
      links,
      nextIndex: links.length > 0 ? nextIndex % links.length : 0,
    }
    return acc
  }, {})

  const mergedAiSettings = {
    gasUrl: sanitizeString(config.aiSettings?.gasUrl ?? fallback.aiSettings?.gasUrl),
    geminiApiKey: sanitizeString(config.aiSettings?.geminiApiKey ?? fallback.aiSettings?.geminiApiKey),
    prompt: sanitizeString(config.aiSettings?.prompt ?? fallback.aiSettings?.prompt),
    mapsLink: sanitizeString(config.aiSettings?.mapsLink ?? fallback.aiSettings?.mapsLink),
    model: sanitizeString(config.aiSettings?.model ?? fallback.aiSettings?.model),
  }

  return {
    ...DEFAULT_CONFIG,
    ...fallback,
    labels: mergedLabels,
    tiers: mergedTiers,
    aiSettings: mergedAiSettings,
    prompts: mergePrompts(config.prompts, fallback.prompts),
    branding: {
      faviconDataUrl: sanitizeString(config.branding?.faviconDataUrl ?? fallback.branding?.faviconDataUrl),
      logoDataUrl: sanitizeString(config.branding?.logoDataUrl ?? fallback.branding?.logoDataUrl),
    },
    routerDescriptions: mergeRouterDescriptions(config.routerDescriptions, fallback.routerDescriptions),
  }
}

const cloneDefaultConfig = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG))

const fetchConfig = async (store) => {
  const storedConfig = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
  const baseConfig =
    storedConfig && typeof storedConfig === 'object' ? storedConfig : cloneDefaultConfig()
  return mergeWithDefault(baseConfig, baseConfig)
}

const persistConfig = async (store, config) => {
  await store.set(CONFIG_KEY, JSON.stringify(config), {
    contentType: 'application/json',
    metadata: { updatedAt: config.updatedAt || new Date().toISOString() },
  })
}

export const handler = async (event, context) => {
  const store = getConfigStore(context)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    }
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { message: 'POSTメソッドのみ利用できます。' })
  }

  if (!event.body) {
    return jsonResponse(400, { message: 'リクエストボディが空です。' })
  }

  let payload
  try {
    payload = JSON.parse(event.body)
  } catch {
    return jsonResponse(400, { message: 'JSON形式が正しくありません。' })
  }

  const tierKey = String(payload?.tier || '').toLowerCase()

  if (!tierKey) {
    return jsonResponse(400, { message: 'tierパラメータを指定してください。' })
  }

  const config = await fetchConfig(store)
  const tierConfig = config.tiers?.[tierKey]

  if (!tierConfig) {
    return jsonResponse(404, { message: `${tierKey}はサポートされていません。` })
  }

  if (!Array.isArray(tierConfig.links) || tierConfig.links.length === 0) {
    return jsonResponse(404, {
      message: `${config.labels?.[tierKey] || tierKey}のリンクが設定されていません。`,
    })
  }

  const nextIndex = tierConfig.nextIndex ?? 0
  const safeIndex = tierConfig.links.length > 0 ? nextIndex % tierConfig.links.length : 0
  const destination = tierConfig.links[safeIndex]

  const timestamp = new Date().toISOString()

  // update pointer for next call
  tierConfig.nextIndex = (safeIndex + 1) % tierConfig.links.length
  tierConfig.lastServedAt = timestamp
  config.updatedAt = timestamp

  await persistConfig(store, config)

  return jsonResponse(200, {
    url: destination,
    tier: tierKey,
    label: config.labels?.[tierKey] || tierKey,
  })
}
