import { getConfigStore } from './_lib/store.js'

const CONFIG_KEY = 'router-config'

export const config = {
  blobs: true,
}

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '')
const sanitizeSecretInput = (value) => {
  const sanitized = sanitizeString(value)
  return sanitized === '******' ? '' : sanitized
}

const DEFAULT_PROMPTS = {
  page1: { gasUrl: '', prompt: '' },
  page2: { gasUrl: '', prompt: '' },
  page3: { gasUrl: '', prompt: '' },
}

const DEFAULT_FORM1 = {
  title: '体験の満足度を教えてください',
  description: '星評価と設問にご協力ください。内容は生成されるクチコミのトーンに反映されます。',
  questions: [
    {
      id: 'form1-q1',
      title: '今回の満足度を教えてください',
      required: true,
      type: 'rating',
      allowMultiple: false,
      options: [],
      ratingEnabled: false,
      placeholder: '',
      ratingStyle: 'stars',
      includeInReview: true,
    },
    {
      id: 'form1-q2',
      title: '良かった点や印象に残ったことを教えてください',
      required: false,
      type: 'text',
      allowMultiple: false,
      options: [],
      ratingEnabled: false,
      placeholder: '例：スタッフの対応、雰囲気、味など',
      ratingStyle: 'stars',
      includeInReview: true,
    },
  ],
}

const DEFAULT_SURVEY_RESULTS = {
  spreadsheetUrl: '',
  endpointUrl: '',
  apiKey: '',
}

const DEFAULT_USER_PROFILE = {
  storeName: '',
  storeKana: '',
  industry: '',
  customers: '',
  strengths: '',
  keywords: [],
  excludeWords: [],
  nearStation: false,
  referencePrompt: '',
  userId: '',
  admin: {
    name: '',
    email: '',
    password: '',
  },
}

const DEFAULT_USER_DATA_SETTINGS = {
  spreadsheetUrl: '',
  submitGasUrl: '',
  readGasUrl: '',
}

const sanitizeBooleanFlag = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true
    if (['false', '0', 'off', 'no', ''].includes(normalized)) return false
  }
  if (value == null) return fallback
  return Boolean(value)
}

const sanitizeQuestionType = (value) => {
  if (value === 'checkbox') return 'checkbox'
  if (value === 'text') return 'text'
  if (value === 'rating') return 'rating'
  return 'dropdown'
}

const sanitizeRatingStyle = (value) => (value === 'numbers' ? 'numbers' : 'stars')

const sanitizeOptionsArray = (options) => {
  if (!Array.isArray(options)) return []
  return options
    .map((option) => sanitizeString(option))
    .filter((option) => option.length > 0)
}

const sanitizeStringArray = (value) => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => sanitizeString(entry)).filter((entry) => entry.length > 0)
}

const generateUserId = () => `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const normalizeEmail = (value) => sanitizeString(value).toLowerCase()

const sanitizeAdminProfile = (admin = {}, fallback = DEFAULT_USER_PROFILE.admin) => ({
  name: sanitizeString(admin?.name ?? fallback?.name ?? ''),
  email: sanitizeString(admin?.email ?? fallback?.email ?? ''),
  password: sanitizeString(admin?.password ?? fallback?.password ?? ''),
})

const sanitizeUserProfile = (profile = {}, fallback = DEFAULT_USER_PROFILE) => ({
  storeName: sanitizeString(profile?.storeName ?? fallback?.storeName ?? ''),
  storeKana: sanitizeString(profile?.storeKana ?? fallback?.storeKana ?? ''),
  industry: sanitizeString(profile?.industry ?? fallback?.industry ?? ''),
  customers: sanitizeString(profile?.customers ?? fallback?.customers ?? ''),
  strengths: sanitizeString(profile?.strengths ?? fallback?.strengths ?? ''),
  keywords: sanitizeStringArray(profile?.keywords ?? fallback?.keywords ?? []),
  excludeWords: sanitizeStringArray(profile?.excludeWords ?? fallback?.excludeWords ?? []),
  nearStation: sanitizeBooleanFlag(profile?.nearStation, fallback?.nearStation ?? false),
  referencePrompt: sanitizeString(profile?.referencePrompt ?? fallback?.referencePrompt ?? ''),
  userId: sanitizeString(profile?.userId ?? fallback?.userId ?? ''),
  admin: sanitizeAdminProfile(profile?.admin, fallback?.admin),
})

const sanitizeUserDataSettings = (settings = {}, fallback = DEFAULT_USER_DATA_SETTINGS) => ({
  spreadsheetUrl: sanitizeString(settings?.spreadsheetUrl ?? fallback?.spreadsheetUrl ?? ''),
  submitGasUrl: sanitizeString(settings?.submitGasUrl ?? fallback?.submitGasUrl ?? ''),
  readGasUrl: sanitizeString(settings?.readGasUrl ?? fallback?.readGasUrl ?? ''),
})

const sanitizeFormQuestions = (questions, fallbackQuestions = []) => {
  if (!Array.isArray(questions)) return fallbackQuestions

  const sanitized = questions
    .map((question, index) => {
      const fallbackQuestion = fallbackQuestions[index] || {}
      const options = sanitizeOptionsArray(question?.options)
      const fallbackOptions = sanitizeOptionsArray(fallbackQuestion.options)

      const id =
        sanitizeString(question?.id) ||
        sanitizeString(fallbackQuestion.id) ||
        `survey-q-${index + 1}-${Date.now()}`

      const type = sanitizeQuestionType(question?.type || fallbackQuestion.type)
      const requiresOptions = type === 'dropdown' || type === 'checkbox'
      const normalizedOptions = requiresOptions
        ? options.length > 0
          ? options
          : fallbackOptions
        : []

      if (requiresOptions && normalizedOptions.length === 0) {
        return null
      }

      const ratingStyle =
        type === 'rating'
          ? sanitizeRatingStyle(question?.ratingStyle || fallbackQuestion.ratingStyle || 'stars')
          : 'stars'

      return {
        id,
        title: sanitizeString(question?.title || fallbackQuestion.title || `設問${index + 1}`),
        required: sanitizeBooleanFlag(question?.required, fallbackQuestion.required ?? true),
        type,
        allowMultiple:
          type === 'checkbox'
            ? sanitizeBooleanFlag(question?.allowMultiple, fallbackQuestion.allowMultiple ?? false)
            : false,
        options: normalizedOptions,
        ratingEnabled:
          type === 'rating'
            ? false
            : sanitizeBooleanFlag(question?.ratingEnabled, fallbackQuestion.ratingEnabled ?? false),
        ratingStyle,
        placeholder:
          type === 'text'
            ? sanitizeString(question?.placeholder ?? fallbackQuestion.placeholder ?? '')
            : '',
        includeInReview: sanitizeBooleanFlag(
          question?.includeInReview,
          fallbackQuestion.includeInReview ?? true,
        ),
      }
    })
    .filter(Boolean)

  return sanitized.length > 0 ? sanitized : fallbackQuestions
}

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
    headerImageDataUrl: '',
  },
  surveyResults: DEFAULT_SURVEY_RESULTS,
  userProfile: DEFAULT_USER_PROFILE,
  userDataSettings: DEFAULT_USER_DATA_SETTINGS,
  form1: DEFAULT_FORM1,
  updatedAt: null,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

const toClientConfig = (config) => {
  const { routerDescriptions: _unused, ...rest } = config || {}
  return {
    ...rest,
    aiSettings: {
      ...rest.aiSettings,
      geminiApiKey: rest.aiSettings?.geminiApiKey ? '******' : '',
      hasGeminiApiKey: Boolean(rest.aiSettings?.geminiApiKey),
    },
  }
}

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

const mergeWithDefault = (config = {}, fallback = DEFAULT_CONFIG) => {
  const mergedLabels = {
    ...DEFAULT_CONFIG.labels,
    ...(fallback.labels || {}),
    ...(config.labels || {}),
  }

  const mergedTiers = Object.entries(DEFAULT_CONFIG.tiers).reduce((acc, [tierKey, defaults]) => {
    const storedTier = (config.tiers && config.tiers[tierKey]) || (fallback.tiers && fallback.tiers[tierKey]) || {}
    acc[tierKey] = {
      links: Array.isArray(storedTier.links) ? storedTier.links : [],
      nextIndex: Number.isInteger(storedTier.nextIndex) ? storedTier.nextIndex % Math.max(storedTier.links?.length || 1, 1) : 0,
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

  const mergedPrompts = mergePrompts(config.prompts, fallback.prompts)
  const mergedBranding = {
    faviconDataUrl: sanitizeString(config.branding?.faviconDataUrl ?? fallback.branding?.faviconDataUrl),
    logoDataUrl: sanitizeString(config.branding?.logoDataUrl ?? fallback.branding?.logoDataUrl),
    headerImageDataUrl: sanitizeString(
      config.branding?.headerImageDataUrl ?? fallback.branding?.headerImageDataUrl,
    ),
  }
  const mergedSurveyResults = {
    spreadsheetUrl: sanitizeString(
      config.surveyResults?.spreadsheetUrl ??
        fallback.surveyResults?.spreadsheetUrl ??
        DEFAULT_SURVEY_RESULTS.spreadsheetUrl,
    ),
    endpointUrl: sanitizeString(
      config.surveyResults?.endpointUrl ??
        fallback.surveyResults?.endpointUrl ??
        DEFAULT_SURVEY_RESULTS.endpointUrl,
    ),
    apiKey: sanitizeString(
      config.surveyResults?.apiKey ?? fallback.surveyResults?.apiKey ?? DEFAULT_SURVEY_RESULTS.apiKey,
    ),
  }
  const mergeForm = (key, defaults) => ({
    title: sanitizeString(config[key]?.title ?? fallback[key]?.title ?? defaults.title),
    description: sanitizeString(config[key]?.description ?? fallback[key]?.description ?? defaults.description),
    questions: sanitizeFormQuestions(
      config[key]?.questions,
      fallback[key]?.questions ?? defaults.questions,
    ),
  })
  const mergedForm1 = mergeForm('form1', DEFAULT_FORM1)
  const mergedUserProfile = sanitizeUserProfile(config.userProfile, fallback.userProfile)
  const mergedUserDataSettings = sanitizeUserDataSettings(config.userDataSettings, fallback.userDataSettings)

  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...fallback,
    labels: mergedLabels,
    tiers: mergedTiers,
    aiSettings: mergedAiSettings,
    prompts: mergedPrompts,
    branding: mergedBranding,
    surveyResults: mergedSurveyResults,
    userProfile: mergedUserProfile,
    userDataSettings: mergedUserDataSettings,
    form1: mergedForm1,
    updatedAt: config.updatedAt || fallback.updatedAt || DEFAULT_CONFIG.updatedAt,
  }

  delete mergedConfig.routerDescriptions

  return mergedConfig
}

export const handler = async (event, context) => {
  const store = getConfigStore(context)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    }
  }

  if (event.httpMethod === 'GET') {
    const storedConfig = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
    const config = mergeWithDefault(storedConfig || DEFAULT_CONFIG)
    return jsonResponse(200, toClientConfig(config))
  }

  if (event.httpMethod === 'POST') {
    const storedConfig = await store.get(CONFIG_KEY, { type: 'json' }).catch(() => null)
    const existingConfig = mergeWithDefault(storedConfig || DEFAULT_CONFIG)

    if (!event.body) {
      return jsonResponse(400, { message: 'リクエストボディが空です。' })
    }

    let payload
    try {
      payload = JSON.parse(event.body)
    } catch {
      return jsonResponse(400, { message: 'JSON形式が正しくありません。' })
    }

    if (!payload || typeof payload !== 'object') {
      return jsonResponse(400, { message: '設定が見つかりません。' })
    }

    const newConfig = mergeWithDefault(payload, existingConfig)

    const existingAdminEmail = normalizeEmail(existingConfig.userProfile?.admin?.email || '')
    const incomingAdminEmail = normalizeEmail(newConfig.userProfile?.admin?.email || '')
    const existingUserId = sanitizeString(existingConfig.userProfile?.userId)
    const incomingUserId = sanitizeString(newConfig.userProfile?.userId)
    const hasIncomingEmail = Boolean(incomingAdminEmail)
    const emailChanged = hasIncomingEmail && incomingAdminEmail !== existingAdminEmail

    if (emailChanged) {
      newConfig.userProfile.userId = generateUserId()
    } else if (!incomingUserId && existingUserId) {
      newConfig.userProfile.userId = existingUserId
    } else if (!incomingUserId && hasIncomingEmail) {
      newConfig.userProfile.userId = generateUserId()
    }

    const incomingKey = sanitizeSecretInput(payload.aiSettings?.geminiApiKey)
    newConfig.aiSettings.geminiApiKey = incomingKey || existingConfig.aiSettings.geminiApiKey || ''
    const timestamp = new Date().toISOString()
    newConfig.updatedAt = timestamp

    // リンクが存在しないtierのnextIndexは常に0に戻す
    Object.values(newConfig.tiers).forEach((tier) => {
      if (!Array.isArray(tier.links) || tier.links.length === 0) {
        tier.links = []
        tier.nextIndex = 0
      } else {
        tier.nextIndex = Math.max(0, Math.min(tier.nextIndex, tier.links.length - 1))
      }
    })

    await store.set(CONFIG_KEY, JSON.stringify(newConfig), {
      contentType: 'application/json',
      metadata: { updatedAt: timestamp },
    })

    return jsonResponse(200, toClientConfig(newConfig))
  }

  return jsonResponse(405, { message: '許可されていないHTTPメソッドです。' })
}
