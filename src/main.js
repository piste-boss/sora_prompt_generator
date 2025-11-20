const DEFAULT_LABELS = {
  beginner: 'ライトカップ',
  intermediate: 'ミディアムカップ',
  advanced: 'フルシティカップ',
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

const DEFAULT_FAVICON_PATH = '/vite.svg'

const CONFIG_CACHE_KEY = 'oisoya_review_config_cache'
const PROFILE_PREFILL_STORAGE_KEY = 'oisoya_review_prefill_profile'
const PROFILE_PREFILL_WELCOME_KEY = 'oisoya_review_prefill_welcome_shown'
const DEV_MODE_STORAGE_KEY = 'oisoya_review_dev_mode'

const readCachedConfig = () => {
  try {
    const value = window.localStorage.getItem(CONFIG_CACHE_KEY)
    if (!value) return null
    return JSON.parse(value)
  } catch {
    return null
  }
}

const writeCachedConfig = (config) => {
  try {
    window.localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config))
  } catch {
    // noop
  }
}

const readSessionProfilePrefill = () => {
  try {
    const raw = window.sessionStorage.getItem(PROFILE_PREFILL_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const getProfilePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null
  if (payload.profile && typeof payload.profile === 'object') {
    return payload.profile
  }
  return payload
}

const hasShownWelcomePopup = () => {
  try {
    return window.sessionStorage.getItem(PROFILE_PREFILL_WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

const markWelcomePopupShown = () => {
  try {
    window.sessionStorage.setItem(PROFILE_PREFILL_WELCOME_KEY, '1')
  } catch {
    // noop
  }
}

const getWelcomeDisplayName = (payload) => {
  if (!payload || typeof payload !== 'object') return ''
  if (payload.credentials && typeof payload.credentials.displayName === 'string') {
    const trimmed = payload.credentials.displayName.trim()
    if (trimmed) return trimmed
  }
  const profile = getProfilePayload(payload)
  const candidates = [
    profile?.profileAdminName,
    profile?.adminName,
    profile?.admin?.name,
    profile?.name,
    profile?.storeName,
    profile?.storeKana,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  const fallbackEmail =
    typeof payload.credentials?.email === 'string' ? payload.credentials.email.trim() : ''
  return fallbackEmail
}

const createElementWithClass = (tag, className, text) => {
  const element = document.createElement(tag)
  if (className) {
    element.className = className
  }
  if (text) {
    element.textContent = text
  }
  return element
}

const showWelcomePopup = (name) => {
  const overlay = document.createElement('div')
  overlay.className = 'welcome-popup'

  const backdrop = document.createElement('div')
  backdrop.className = 'welcome-popup__backdrop'

  const dialog = document.createElement('div')
  dialog.className = 'welcome-popup__dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-live', 'polite')

  const title = createElementWithClass('p', 'welcome-popup__title', 'こんにちは。')
  const nameEl = createElementWithClass('p', 'welcome-popup__name', `${name} さん`)
  const message = createElementWithClass('p', 'welcome-popup__message', 'ログインが完了しました。')
  const button = createElementWithClass('button', 'welcome-popup__button', 'OK')
  button.type = 'button'

  const dismiss = () => {
    overlay.classList.add('is-leaving')
    setTimeout(() => {
      overlay.remove()
    }, 200)
  }

  button.addEventListener('click', dismiss)
  backdrop.addEventListener('click', dismiss)

  dialog.appendChild(title)
  dialog.appendChild(nameEl)
  dialog.appendChild(message)
  dialog.appendChild(button)

  overlay.appendChild(backdrop)
  overlay.appendChild(dialog)

  document.body.appendChild(overlay)
}

const maybeShowWelcomePopup = () => {
  if (hasShownWelcomePopup()) {
    return
  }
  const payload = readSessionProfilePrefill()
  if (!payload) return
  const name = getWelcomeDisplayName(payload)
  if (!name) return
  showWelcomePopup(name)
  markWelcomePopupShown()
}

const getCurrentUserEmail = () => {
  const payload = readSessionProfilePrefill()
  const raw = payload?.credentials?.email || payload?.profile?.email || ''
  return typeof raw === 'string' ? raw.trim() : ''
}

const isDeveloperModeEnabled = () => {
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let subscriptionCache = { email: '', active: false, timestamp: 0 }
const SUBSCRIPTION_CACHE_TTL = 30 * 1000

const ensureSubscriptionActive = async () => {
  if (isDeveloperModeEnabled()) {
    subscriptionCache = {
      email: '__dev__',
      active: true,
      timestamp: Date.now(),
    }
    return true
  }
  const email = getCurrentUserEmail()
  if (!email) {
    throw new Error('ログイン情報が見つかりません。再度ログインしてください。')
  }

  const now = Date.now()
  if (subscriptionCache.email === email && now - subscriptionCache.timestamp < SUBSCRIPTION_CACHE_TTL) {
    if (!subscriptionCache.active) {
      throw new Error('有効なプランがありません。ユーザー設定からプランを登録してください。')
    }
    return true
  }

  const response = await fetch('/.netlify/functions/check-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.message || 'サブスクリプションの確認に失敗しました。'
    throw new Error(message)
  }

  subscriptionCache = {
    email,
    active: Boolean(payload?.active),
    timestamp: now,
  }

  if (!subscriptionCache.active) {
    throw new Error('有効なプランがありません。ユーザー設定からプランを登録してください。')
  }
  return true
}

const inferFaviconType = (value) => {
  if (!value) return 'image/svg+xml'
  if (value.startsWith('data:image/')) {
    const match = value.match(/^data:(image\/[^;]+)/i)
    if (match) return match[1]
  }
  if (value.endsWith('.png')) return 'image/png'
  if (value.endsWith('.ico')) return 'image/x-icon'
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg'
  if (value.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

const getFaviconLinks = () => {
  const links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
  if (links.length > 0) {
    return Array.from(links)
  }
  const newLink = document.createElement('link')
  newLink.setAttribute('rel', 'icon')
  document.head.appendChild(newLink)
  return [newLink]
}

const getAppleTouchLinks = () => {
  const links = document.querySelectorAll('link[rel="apple-touch-icon"]')
  if (links.length > 0) {
    return Array.from(links)
  }
  const newLink = document.createElement('link')
  newLink.setAttribute('rel', 'apple-touch-icon')
  document.head.appendChild(newLink)
  return [newLink]
}

const setDocumentFavicon = (dataUrl) => {
  const href = dataUrl || DEFAULT_FAVICON_PATH
  const type = inferFaviconType(href)
  const links = getFaviconLinks()
  links.forEach((link) => {
    link.setAttribute('href', href)
    if (type) {
      link.setAttribute('type', type)
    }
  })
  const appleLinks = getAppleTouchLinks()
  appleLinks.forEach((link) => {
    link.setAttribute('href', href)
  })
}

const TIERS = [
  { key: 'beginner', defaultLabel: DEFAULT_LABELS.beginner },
  { key: 'intermediate', defaultLabel: DEFAULT_LABELS.intermediate },
  { key: 'advanced', defaultLabel: DEFAULT_LABELS.advanced },
]

const app = document.querySelector('#app')
if (!app) {
  throw new Error('#app が見つかりません。')
}

const brandElements = {
  container: app.querySelector('[data-role="brand"]'),
  logo: app.querySelector('[data-role="brand-logo"]'),
  text: app.querySelector('[data-role="brand-text"]'),
}

const applyBrandingLogo = (branding = {}) => {
  const headerImageUrl = branding.headerImageDataUrl || ''
  if (brandElements.logo) {
    if (headerImageUrl) {
      brandElements.logo.src = headerImageUrl
      brandElements.logo.removeAttribute('hidden')
    } else {
      brandElements.logo.setAttribute('hidden', '')
      brandElements.logo.removeAttribute('src')
    }
  }

  if (brandElements.text) {
    if (headerImageUrl) {
      brandElements.text.setAttribute('hidden', '')
    } else {
      brandElements.text.removeAttribute('hidden')
    }
  }

  if (brandElements.container) {
    brandElements.container.classList.toggle('has-image', Boolean(headerImageUrl))
  }

  const faviconUrl = branding.logoDataUrl || branding.faviconDataUrl || ''
  setDocumentFavicon(faviconUrl)
}

const statusEl = app.querySelector('[data-role="status"]')
const buttons = Array.from(app.querySelectorAll('[data-tier]'))
if (buttons.length === 0) {
  throw new Error('必要なDOM要素が初期化されていません。')
}

const cachedConfig = readCachedConfig()

if (cachedConfig?.branding) {
  applyBrandingLogo(cachedConfig.branding)
} else {
  applyBrandingLogo()
}

let labels = {
  ...DEFAULT_LABELS,
  ...(cachedConfig?.labels ?? {}),
}
const setStatus = (message, type = 'info') => {
  if (!statusEl) {
    return
  }
  if (!message) {
    statusEl.setAttribute('hidden', '')
    statusEl.textContent = ''
    statusEl.dataset.type = ''
    return
  }

  statusEl.removeAttribute('hidden')
  statusEl.textContent = message
  statusEl.dataset.type = type
}

const applyLabels = () => {
  buttons.forEach((button) => {
    const tierKey = button.dataset.tier
    const label = labels[tierKey] || DEFAULT_LABELS[tierKey] || tierKey
    button.querySelector('.router__button-label').textContent = label
  })
}

const applyRouterDescriptions = () => {
  buttons.forEach((button) => {
    const tierKey = button.dataset.tier
    const entry = DEFAULT_ROUTER_DESCRIPTIONS[tierKey] || { highlight: '', description: '' }
    const highlightEl = button.querySelector('[data-role="button-meta-highlight"]')
    const descriptionEl = button.querySelector('[data-role="button-meta-description"]')
    if (highlightEl) {
      const text = entry.highlight ?? ''
      highlightEl.textContent = text
      highlightEl.toggleAttribute('hidden', !text)
    }
    if (descriptionEl) {
      const text = entry.description ?? ''
      descriptionEl.textContent = text
      descriptionEl.toggleAttribute('hidden', !text)
    }
  })
}

const toggleButtons = (disabled) => {
  buttons.forEach((button) => {
    if (disabled) {
      button.setAttribute('disabled', '')
      button.classList.add('is-loading')
    } else {
      button.removeAttribute('disabled')
      button.classList.remove('is-loading')
    }
  })
}

const handleDistribution = async (tierKey) => {
  const label = labels[tierKey] || DEFAULT_LABELS[tierKey] || tierKey
  setStatus('プランを確認しています…')
  toggleButtons(true)

  try {
    await ensureSubscriptionActive()
    setStatus(`${label}へ最適なフォームを探しています…`)
    const response = await fetch('/.netlify/functions/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tierKey }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      const errorMessage =
        errorPayload?.message ||
        'リダイレクト先を取得できませんでした。時間をおいて再度お試しください。'
      throw new Error(errorMessage)
    }

    const payload = await response.json()
    if (!payload?.url) {
      throw new Error('リダイレクト先URLが設定されていません。')
    }

    window.location.href = payload.url
  } catch (error) {
    console.error(error)
    setStatus(error.message, 'error')
    toggleButtons(false)
  }
}

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    handleDistribution(button.dataset.tier)
  })
})

const resetUIState = () => {
  toggleButtons(false)
  setStatus('')
  const latestCached = readCachedConfig()
  labels = {
    ...DEFAULT_LABELS,
    ...(latestCached?.labels ?? {}),
  }
  applyBrandingLogo(latestCached?.branding)
  applyLabels()
  applyRouterDescriptions()
}

const loadConfig = async () => {
  try {
    const response = await fetch('/.netlify/functions/config')
    if (!response.ok) {
      throw new Error('設定の取得に失敗しました。デフォルト表示で続行します。')
    }
    const payload = await response.json()
    if (payload?.labels) {
      labels = { ...DEFAULT_LABELS, ...payload.labels }
      applyLabels()
      writeCachedConfig(payload)
      applyBrandingLogo(payload.branding)
    }
    applyRouterDescriptions()
    setStatus('')
  } catch (error) {
    console.warn(error)
    const fallbackConfig = readCachedConfig()
    labels = {
      ...DEFAULT_LABELS,
      ...(fallbackConfig?.labels ?? {}),
    }
    applyLabels()
    applyRouterDescriptions()
    applyBrandingLogo(fallbackConfig?.branding)
    setStatus(error.message, 'warn')
  }
}

applyLabels()
applyRouterDescriptions()
maybeShowWelcomePopup()
loadConfig()

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    const latestCached = readCachedConfig()
    labels = {
      ...DEFAULT_LABELS,
      ...(latestCached?.labels ?? {}),
    }
    applyLabels()
    applyRouterDescriptions()
    applyBrandingLogo(latestCached?.branding)
    resetUIState()
    loadConfig()
  } else {
    toggleButtons(false)
  }
})
import './style.css'
