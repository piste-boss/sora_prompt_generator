const PROFILE_PREFILL_STORAGE_KEY = 'oisoya_review_prefill_profile'

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
  } catch {
    // noop
  }
}

const handleLogin = async () => {
  if (!form || !emailInput || !passwordInput || !loginButton) return
  const email = (emailInput.value || '').trim()
  const password = (passwordInput.value || '').trim()
  if (!email || !password) {
    setStatus('メールアドレスとパスワードを入力してください。', 'error')
    return
  }

  isSubmitting = true
  updateButtonState()
  setStatus('ログインしています…', 'info')

  try {
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

    storePrefillProfile(profile, { email, password })
    setStatus('ログイン成功。ユーザー設定ページへ移動します。', 'success')

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
