const PROFILE_PREFILL_STORAGE_KEY = 'oisoya_review_prefill_profile'
const PROFILE_PREFILL_WELCOME_KEY = 'oisoya_review_prefill_welcome_shown'
const DEV_MODE_STORAGE_KEY = 'oisoya_review_dev_mode'

const app = document.querySelector('#login-app')
if (!app) {
  throw new Error('#login-app が見つかりません。')
}

const form = app.querySelector('#login-form')
const statusEl = app.querySelector('[data-role="status"]')
const loginButton = form?.querySelector('[data-role="login-submit"]')
const registerButton = form?.querySelector('[data-role="register-link"]')
const emailInput = form?.elements.email
const passwordInput = form?.elements.password

let isSubmitting = false

const setStatus = (message, type = 'info') => {
  if (!statusEl) return
  if (!message) {
    statusEl.textContent = ''
    statusEl.dataset.type = ''
    statusEl.setAttribute('hidden', '')
    return
  }
  statusEl.textContent = message
  statusEl.dataset.type = type
  statusEl.removeAttribute('hidden')
}

const updateButtonState = () => {
  if (!loginButton) return
  const hasEmail = Boolean((emailInput?.value || '').trim())
  const hasPassword = Boolean((passwordInput?.value || '').trim())
  loginButton.disabled = isSubmitting || !hasEmail || !hasPassword
}

const trimIfString = (value) => (typeof value === 'string' ? value.trim() : '')
const isDeveloperModeEnabled = () => {
  try {
    return window.localStorage.getItem(DEV_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const resolveProfileDisplayName = (profile, fallbackEmail = '') => {
  if (!profile || typeof profile !== 'object') {
    return trimIfString(fallbackEmail)
  }
  const candidates = [
    profile.profileAdminName,
    profile.adminName,
    profile.admin?.name,
    profile.name,
    profile.storeName,
    profile.storeKana,
  ]
  for (const candidate of candidates) {
    const text = trimIfString(candidate)
    if (text) {
      return text
    }
  }
  return trimIfString(fallbackEmail)
}

const storePrefillProfile = (profile, credentials) => {
  if (!profile) return
  try {
    window.sessionStorage.setItem(
      PROFILE_PREFILL_STORAGE_KEY,
      JSON.stringify({
        profile,
        credentials: credentials || null,
        storedAt: new Date().toISOString(),
      }),
    )
    window.sessionStorage.removeItem(PROFILE_PREFILL_WELCOME_KEY)
  } catch {
    // noop
  }
}

const handleLogin = async () => {
  if (!form || !emailInput || !passwordInput || !loginButton) return
  const email = (emailInput.value || '').trim()
  const password = (passwordInput.value || '').trim()
  const devMode = isDeveloperModeEnabled()
  if (!email || !password) {
    setStatus('メールアドレスとパスワードを入力してください。', 'error')
    return
  }

  isSubmitting = true
  updateButtonState()
  setStatus(devMode ? 'デベロッパーモードでログイン中…' : 'ログインしています…', 'info')

  try {
    if (devMode) {
      const demoProfile = {
        profileAdminName: 'Developer Demo',
        adminName: 'Developer Demo',
        email,
      }
      storePrefillProfile(demoProfile, { email, password, displayName: 'Developer Demo' })
      setStatus('デベロッパーモードでログインしました。', 'success')
      setTimeout(() => {
        window.location.assign('/')
      }, 400)
      return
    }

    const response = await fetch('/.netlify/functions/user-data-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        sheetName: 'profiles',
      }),
    })

    const responseText = await response.text()
    let payload = {}
    try {
      payload = responseText ? JSON.parse(responseText) : {}
    } catch {
      payload = {}
    }

    if (!response.ok) {
      const message =
        payload?.message || payload?.error || '保存済みの情報を読み込めませんでした。時間を空けて再試行してください。'
      throw new Error(message)
    }

    const profile =
      (payload && typeof payload.profile === 'object' && payload.profile) ||
      (payload && typeof payload.data === 'object' && payload.data.profile) ||
      (payload && typeof payload.data === 'object' && payload.data) ||
      null

    if (!profile) {
      throw new Error('一致するユーザー情報が見つかりませんでした。')
    }

    const displayName = resolveProfileDisplayName(profile, email)
    storePrefillProfile(profile, { email, password, displayName })
    setStatus('ログイン成功。', 'success')

    setTimeout(() => {
      window.location.assign('/')
    }, 800)
  } catch (error) {
    console.error('Login failed:', error)
    setStatus(error.message || '読み込みに失敗しました。入力内容をご確認ください。', 'error')
  } finally {
    isSubmitting = false
    updateButtonState()
  }
}

if (!form || !emailInput || !passwordInput || !loginButton || !registerButton) {
  throw new Error('ログイン画面の必須要素が見つかりません。')
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!loginButton.disabled) {
    handleLogin()
  }
})

emailInput.addEventListener('input', updateButtonState)
passwordInput.addEventListener('input', updateButtonState)
updateButtonState()

registerButton.addEventListener('click', (event) => {
  event.preventDefault()
  window.location.assign('/user/?register=1')
})
