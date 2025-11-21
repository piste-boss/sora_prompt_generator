const CONFIG_CACHE_KEY = 'oisoya_review_config_cache'
const LAST_SUBMISSION_STORAGE_KEY = 'oisoya_review_last_submission'
const PROFILE_PREFILL_STORAGE_KEY = 'oisoya_review_prefill_profile'
const PROFILE_PREFILL_WELCOME_KEY = 'oisoya_review_prefill_welcome_shown'

const DEFAULT_FORMS = {
  form1: {
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
  },
}

const RATING_SCALE = [1, 2, 3, 4, 5]

const DEFAULT_SURVEY_RESULTS = {
  spreadsheetUrl: '',
  endpointUrl: '',
  apiKey: '',
}

const app = document.querySelector('#form2-app')
if (!app) {
  throw new Error('#form2-app が見つかりません。')
}

const htmlElement = document.documentElement
const markAppReady = (() => {
  let ready = false
  return () => {
    if (ready) return
    ready = true
    htmlElement.classList.add('app-ready')
  }
})()

const FORM_KEY = app.dataset.formKey || 'form1'
const DEFAULT_FORM = DEFAULT_FORMS[FORM_KEY] || DEFAULT_FORMS.form1

const titleEl = app.querySelector('[data-role="title"]')
const leadEl = app.querySelector('[data-role="lead"]')
const questionListEl = app.querySelector('[data-role="question-list"]')
const statusEl = app.querySelector('[data-role="status"]')
const submitButton = app.querySelector('[data-role="submit"]')

const brandElements = {
  container: app.querySelector('[data-role="brand"]'),
  logo: app.querySelector('[data-role="brand-logo"]'),
  text: app.querySelector('[data-role="brand-text"]'),
}

const questionRefs = new Map()
let currentFormConfig = DEFAULT_FORM
let surveyResultsConfig = { ...DEFAULT_SURVEY_RESULTS }
let isSubmitting = false

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
  if (hasShownWelcomePopup()) return
  const payload = readSessionProfilePrefill()
  if (!payload) return
  const name = getWelcomeDisplayName(payload)
  if (!name) return
  showWelcomePopup(name)
  markWelcomePopupShown()
}

const generateResponseId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `resp-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
}

const storeLastSubmissionInfo = (formKey, submittedAt, responseId) => {
  if (!formKey || !submittedAt) return
  try {
    window.sessionStorage.setItem(
      LAST_SUBMISSION_STORAGE_KEY,
      JSON.stringify({ formKey, submittedAt, responseId: responseId || '' }),
    )
  } catch {
    // noop
  }
}

const updateSurveyResultsConfig = (config) => {
  surveyResultsConfig = {
    ...DEFAULT_SURVEY_RESULTS,
    ...(config?.surveyResults || {}),
  }
}

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
}

const userMenu = app.querySelector('[data-role="user-menu"]')
const userMenuTrigger = app.querySelector('[data-role="user-menu-trigger"]')
const userMenuPanel = app.querySelector('[data-role="user-menu-panel"]')
const userMenuLinks = document.querySelectorAll('[data-role="user-menu-link"]')
const userMenuLogoutLinks = document.querySelectorAll('[data-role="user-menu-logout"]')

const closeUserMenu = () => {
  if (!userMenuTrigger || !userMenuPanel || !userMenu) return
  userMenuTrigger.setAttribute('aria-expanded', 'false')
  userMenuPanel.setAttribute('aria-hidden', 'true')
  userMenu.classList.remove('is-open')
  userMenuPanel.classList.remove('is-open')
}

const openUserMenu = () => {
  if (!userMenuTrigger || !userMenuPanel || !userMenu) return
  userMenuTrigger.setAttribute('aria-expanded', 'true')
  userMenuPanel.setAttribute('aria-hidden', 'false')
  userMenu.classList.add('is-open')
  userMenuPanel.classList.add('is-open')
}

const positionUserMenuPanel = () => {
  if (!userMenuTrigger || !userMenuPanel) return
  const rect = userMenuTrigger.getBoundingClientRect()
  const top = rect.bottom + 8
  const right = Math.max(12, window.innerWidth - rect.right)
  userMenuPanel.style.position = 'fixed'
  userMenuPanel.style.top = `${top}px`
  userMenuPanel.style.right = `${right}px`
  userMenuPanel.style.left = 'auto'
  userMenuPanel.style.maxWidth = 'min(280px, 90vw)'
  userMenuPanel.style.zIndex = '100000'
}

const performLogout = () => {
  try {
    window.sessionStorage.removeItem(PROFILE_PREFILL_STORAGE_KEY)
    window.sessionStorage.removeItem(PROFILE_PREFILL_WELCOME_KEY)
    window.localStorage.removeItem(DEV_MODE_STORAGE_KEY)
  } catch {
    // noop
  }
  closeUserMenu()
  window.location.assign('/login/')
}

if (userMenuLogoutLinks && userMenuLogoutLinks.length > 0) {
  userMenuLogoutLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      performLogout()
    })
  })
}

if (userMenu && userMenuTrigger && userMenuPanel) {
  userMenuTrigger.addEventListener('click', () => {
    if (!userMenuPanel.dataset.attachedToBody) {
      document.body.appendChild(userMenuPanel)
      userMenuPanel.dataset.attachedToBody = '1'
    }
    const expanded = userMenuTrigger.getAttribute('aria-expanded') === 'true'
    if (expanded) {
      closeUserMenu()
    } else {
      positionUserMenuPanel()
      openUserMenu()
    }
  })

  document.addEventListener('click', (event) => {
    if (!userMenu.contains(event.target)) {
      closeUserMenu()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeUserMenu()
    }
  })

  window.addEventListener('resize', () => {
    if (userMenu.classList.contains('is-open')) {
      positionUserMenuPanel()
    }
  })
}

const clearQuestionStatus = (statusNode) => {
  if (!statusNode) return
  statusNode.textContent = ''
  statusNode.setAttribute('hidden', '')
}

const setQuestionError = (statusNode, message) => {
  if (!statusNode) return
  statusNode.textContent = message
  statusNode.removeAttribute('hidden')
}

const normalizeQuestionType = (value) => {
  if (value === 'checkbox') return 'checkbox'
  if (value === 'text') return 'text'
  if (value === 'rating') return 'rating'
  return 'dropdown'
}

const normalizeRatingStyle = (value) => (value === 'numbers' ? 'numbers' : 'stars')

const normalizeQuestions = (questions = []) => {
  if (!Array.isArray(questions)) return DEFAULT_FORM.questions
  const normalized = questions
    .map((question, index) => {
      const options = Array.isArray(question?.options)
        ? question.options.map((option) => (typeof option === 'string' ? option.trim() : '')).filter(Boolean)
        : []
      const type = normalizeQuestionType(question.type)
      const requiresOptions = type === 'dropdown' || type === 'checkbox'
      if (requiresOptions && options.length === 0) {
        return null
      }
      const normalizedOptions = requiresOptions ? options : []
      return {
        id: typeof question.id === 'string' && question.id.trim() ? question.id : `form1-q-${index + 1}`,
        title: typeof question.title === 'string' && question.title.trim() ? question.title : `設問${index + 1}`,
        required: Boolean(question.required),
        type,
        allowMultiple: type === 'checkbox' ? Boolean(question.allowMultiple) : false,
        options: normalizedOptions,
        ratingEnabled: type !== 'rating' && Boolean(question.ratingEnabled),
        ratingStyle: type === 'rating' ? normalizeRatingStyle(question.ratingStyle) : 'stars',
        placeholder: type === 'text' && typeof question.placeholder === 'string' ? question.placeholder : '',
        includeInReview: question.includeInReview !== false,
      }
    })
    .filter(Boolean)

  return normalized.length > 0 ? normalized : DEFAULT_FORM.questions
}

const describeQuestion = (question) => {
  if (question.type === 'checkbox') {
    if (question.allowMultiple) return '該当する項目をすべて選択してください。'
    return 'もっとも当てはまる項目を1つ選択してください。'
  }
  if (question.type === 'rating') {
    if (question.ratingStyle === 'numbers') {
      return '1〜5の数字から今回の評価を選択してください。'
    }
    return '星マークをタップして今回の評価を選択してください。'
  }
  if (question.type === 'text') {
    return '自由入力欄です。感じたことをそのままご記入ください。'
  }
  return 'プルダウンから1つ選択してください。'
}

const buildDropdown = (question, statusNode) => {
  const select = document.createElement('select')
  select.className = 'form2__select'
  select.dataset.questionControl = question.id

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = '選択してください'
  select.appendChild(placeholder)

  question.options.forEach((option) => {
    const optionEl = document.createElement('option')
    optionEl.value = option
    optionEl.textContent = option
    select.appendChild(optionEl)
  })

  select.addEventListener('change', () => {
    if (select.value) {
      clearQuestionStatus(statusNode)
    }
  })

  return select
}

const buildCheckboxGroup = (question, statusNode) => {
  const container = document.createElement('div')
  container.className = 'form2__options'

  const inputs = question.options.map((option) => {
    const label = document.createElement('label')
    label.className = 'form2__option'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.name = question.id
    input.value = option
    input.addEventListener('change', () => {
      if (!question.allowMultiple && input.checked) {
        inputs.forEach((other) => {
          if (other !== input) {
            other.checked = false
          }
        })
      }
      if (input.checked) {
        clearQuestionStatus(statusNode)
      }
    })
    label.appendChild(input)
    const text = document.createElement('span')
    text.textContent = option
    label.appendChild(text)
    container.appendChild(label)
    return input
  })

  return { container, inputs }
}

const buildTextInput = (question, statusNode) => {
  const textarea = document.createElement('textarea')
  textarea.className = 'form2__textarea'
  textarea.rows = 4
  textarea.placeholder = question.placeholder || '自由にご記入ください。'
  textarea.dataset.questionControl = question.id
  textarea.addEventListener('input', () => {
    if ((textarea.value || '').trim()) {
      clearQuestionStatus(statusNode)
    }
  })
  return textarea
}

const highlightRatingButtons = (buttons, score) => {
  buttons.forEach((button) => {
    const value = Number(button.dataset.score)
    button.classList.toggle('is-active', value === score)
    button.classList.toggle('is-filled', value <= score)
    button.setAttribute('aria-pressed', value === score ? 'true' : 'false')
  })
}

const buildRatingControls = ({ mode = 'stars' } = {}) => {
  const container = document.createElement('div')
  container.className = 'form2__rating'

  const guides = document.createElement('div')
  guides.className = 'form2__rating-guides'
  const lowGuide = document.createElement('span')
  lowGuide.textContent = mode === 'numbers' ? '1（低い）' : '低い'
  const highGuide = document.createElement('span')
  highGuide.textContent = mode === 'numbers' ? '5（高い）' : '高い'
  guides.append(lowGuide, highGuide)
  container.appendChild(guides)

  const buttonsWrap = document.createElement('div')
  buttonsWrap.className = 'form2__rating-buttons'
  container.appendChild(buttonsWrap)

  const buttons = RATING_SCALE.map((score) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'form2__rating-button'
    button.dataset.score = String(score)
    button.setAttribute('aria-label', `${score}点`)
    if (mode === 'numbers') {
      button.classList.add('form2__rating-button--number')
      button.textContent = String(score)
    } else {
      button.classList.add('form2__rating-button--star')
      button.innerHTML = '<span aria-hidden="true">★</span>'
    }
    buttonsWrap.appendChild(button)
    return button
  })

  return { container, buttons }
}

const renderQuestions = () => {
  if (!questionListEl) return
  questionListEl.innerHTML = ''
  questionRefs.clear()

  currentFormConfig.questions.forEach((question, index) => {
    const questionCard = document.createElement('article')
    questionCard.className = 'form2__question'
    questionCard.dataset.questionId = question.id
    const includeInReview = question.includeInReview !== false
    questionCard.dataset.includeInReview = includeInReview ? 'true' : 'false'

    const heading = document.createElement('div')
    heading.className = 'form2__question-heading'
    const title = document.createElement('p')
    title.className = 'form2__question-title'
    title.textContent = question.title
    heading.appendChild(title)

    const badge = document.createElement('span')
    const isRequired = Boolean(question.required)
    badge.className = 'form2__badge'
    if (isRequired) {
      badge.textContent = '必須'
    } else {
      badge.textContent = '任意'
      badge.classList.add('form2__badge--optional')
    }
    heading.appendChild(badge)
    questionCard.appendChild(heading)

    const instructions = document.createElement('p')
    instructions.className = 'form2__question-instructions'
    instructions.textContent = describeQuestion(question)
    questionCard.appendChild(instructions)

    const statusNode = document.createElement('p')
    statusNode.className = 'form2__question-status'
    statusNode.setAttribute('hidden', '')

    if (question.type === 'rating') {
      const ratingContent = buildRatingControls({
        mode: question.ratingStyle,
      })
      questionCard.appendChild(ratingContent.container)
      const ref = {
        type: 'rating',
        required: question.required,
        allowMultiple: false,
        selectEl: null,
        inputs: [],
        textEl: null,
        statusEl: statusNode,
        title: question.title,
        includeInReview,
        rating: {
          currentScore: 0,
          buttons: ratingContent.buttons,
        },
        order: index,
      }
      questionRefs.set(question.id, ref)
      ratingContent.buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const score = Number(button.dataset.score)
          ref.rating.currentScore = score
          highlightRatingButtons(ratingContent.buttons, score)
        })
      })
    } else if (question.type === 'dropdown') {
      const select = buildDropdown(question, statusNode)
      questionCard.appendChild(select)
      questionRefs.set(question.id, {
        type: 'dropdown',
        required: question.required,
        allowMultiple: false,
        selectEl: select,
        inputs: [],
        textEl: null,
        statusEl: statusNode,
        title: question.title,
        includeInReview,
        rating: null,
        order: index,
      })
    } else if (question.type === 'checkbox') {
      const { container, inputs } = buildCheckboxGroup(question, statusNode)
      questionCard.appendChild(container)
      questionRefs.set(question.id, {
        type: 'checkbox',
        required: question.required,
        allowMultiple: question.allowMultiple,
        selectEl: null,
        inputs,
        textEl: null,
        statusEl: statusNode,
        title: question.title,
        includeInReview,
        rating: null,
        order: index,
      })
    } else {
      const textarea = buildTextInput(question, statusNode)
      questionCard.appendChild(textarea)
      questionRefs.set(question.id, {
        type: 'text',
        required: question.required,
        allowMultiple: false,
        selectEl: null,
        inputs: [],
        textEl: textarea,
        statusEl: statusNode,
        title: question.title,
        includeInReview,
        rating: null,
        order: index,
      })
    }

    if (question.type !== 'rating' && question.ratingEnabled) {
      const ratingContent = buildRatingControls()
      questionCard.appendChild(ratingContent.container)
      const ref = questionRefs.get(question.id)
      if (ref) {
        ref.rating = {
          currentScore: 0,
          buttons: ratingContent.buttons,
        }
        ratingContent.buttons.forEach((button) => {
          button.addEventListener('click', () => {
            const score = Number(button.dataset.score)
            ref.rating.currentScore = score
            highlightRatingButtons(ratingContent.buttons, score)
          })
        })
      }
    }

    questionCard.appendChild(statusNode)
    questionListEl.appendChild(questionCard)
  })
}

const applyFormContent = (formConfig = {}) => {
  currentFormConfig = {
    ...DEFAULT_FORM,
    ...formConfig,
    questions: normalizeQuestions(formConfig.questions),
  }

  if (titleEl) {
    titleEl.textContent = currentFormConfig.title || DEFAULT_FORM.title
  }
  if (leadEl) {
    leadEl.textContent = currentFormConfig.description || DEFAULT_FORM.description
  }

  renderQuestions()
}

const loadConfig = async () => {
  try {
    const response = await fetch('/.netlify/functions/config')
    if (!response.ok) {
      throw new Error('フォーム設定の取得に失敗しました。')
    }
    const payload = await response.json()
    writeCachedConfig(payload)
    applyBrandingLogo(payload.branding)
    updateSurveyResultsConfig(payload)
    const formConfig = payload?.[FORM_KEY]
    if (formConfig) {
      applyFormContent(formConfig)
    }
  } catch (error) {
    console.warn(error)
  } finally {
    markAppReady()
  }
}

const initializeForm = () => {
  const cached = readCachedConfig()
  if (cached?.[FORM_KEY]) {
    applyFormContent(cached[FORM_KEY])
    updateSurveyResultsConfig(cached)
    applyBrandingLogo(cached.branding)
  } else {
    applyFormContent(DEFAULT_FORM)
    applyBrandingLogo()
  }

  loadConfig()
}

const collectAnswers = () => {
  const errors = []
  const answerEntries = []

  questionRefs.forEach((ref, questionId) => {
    clearQuestionStatus(ref.statusEl)
    let value

    if (ref.type === 'dropdown') {
      value = ref.selectEl?.value || ''
      if (ref.required && !value) {
        errors.push(questionId)
        setQuestionError(ref.statusEl, '選択してください。')
      }
    } else if (ref.type === 'checkbox') {
      const selected = ref.inputs.filter((input) => input.checked).map((input) => input.value)
      if (ref.required && selected.length === 0) {
        errors.push(questionId)
        setQuestionError(ref.statusEl, '該当する項目を選択してください。')
      }
      if (!ref.allowMultiple && selected.length > 1) {
        selected.splice(1)
      }
      value = ref.allowMultiple ? selected : selected[0] || ''
    } else if (ref.type === 'rating') {
      const score = ref.rating?.currentScore ?? 0
      if (ref.required && !score) {
        errors.push(questionId)
        setQuestionError(ref.statusEl, '評価を選択してください。')
      }
      value = score
    } else {
      const textValue = (ref.textEl?.value || '').trim()
      if (ref.required && !textValue) {
        errors.push(questionId)
        setQuestionError(ref.statusEl, '入力してください。')
      }
      value = textValue
    }

    const includeInReview = ref.includeInReview !== false
    const questionLabel = (ref.title || '').trim() || questionId
    const answerKey = includeInReview ? questionLabel : `not-reflect:${questionLabel}`
    answerEntries.push({
      key: answerKey,
      order: typeof ref.order === 'number' ? ref.order : Number.MAX_SAFE_INTEGER,
      payload: {
        value,
        rating: ref.rating ? ref.rating.currentScore || 0 : 0,
        questionId: questionLabel,
        questionInternalId: questionId,
        questionTitle: questionLabel,
        includeInReview,
        questionOrder: typeof ref.order === 'number' ? ref.order : null,
      },
    })
  })

  const sortedEntries = answerEntries.sort((a, b) => a.order - b.order)

  const answers = sortedEntries.reduce((acc, entry) => {
    acc[entry.key] = entry.payload
    return acc
  }, {})

  const answersOrdered = sortedEntries.map((entry) => ({
    key: entry.key,
    ...entry.payload,
  }))

  return { answers, answersOrdered, errors }
}

const buildSubmissionPayload = (answers, answersOrdered, submittedAt, responseId) => ({
  formKey: FORM_KEY,
  answers,
  answersOrdered,
  metadata: {
    submittedAt: submittedAt || new Date().toISOString(),
    responseId: responseId || '',
    userAgent: window.navigator.userAgent,
    referrer: document.referrer || '',
    pageUrl: window.location.href,
    spreadsheetUrl: surveyResultsConfig.spreadsheetUrl || '',
  },
})

const sendSurveyResults = async (answers, answersOrdered, submittedAt, responseId) => {
  if (!surveyResultsConfig.endpointUrl) {
    return false
  }

  const response = await fetch('/.netlify/functions/survey-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSubmissionPayload(answers, answersOrdered, submittedAt, responseId)),
  })

  if (!response.ok) {
    let details = ''
    try {
      const text = await response.text()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          details = parsed?.message || text
        } catch {
          details = text
        }
      }
    } catch {
      // noop
    }
    const errorMessage = details || `アンケート送信に失敗しました (status ${response.status}).`
    throw new Error(errorMessage)
  }

  return true
}

const redirectToGenerator = (submittedAt, responseId) => {
  const redirectMap = {
    form1: '/generator/index.html',
  }
  const basePath = redirectMap[FORM_KEY] || '/generator/index.html'
  if (!submittedAt) {
    window.location.href = basePath
    return
  }
  try {
    const targetUrl = new URL(basePath, window.location.origin)
    targetUrl.searchParams.set('submittedAt', submittedAt)
    targetUrl.searchParams.set('formKey', FORM_KEY)
    if (responseId) {
      targetUrl.searchParams.set('responseId', responseId)
    }
    window.location.href = targetUrl.toString()
  } catch {
    const separator = basePath.includes('?') ? '&' : '?'
    window.location.href = `${basePath}${separator}submittedAt=${encodeURIComponent(
      submittedAt,
    )}&formKey=${encodeURIComponent(FORM_KEY)}${
      responseId ? `&responseId=${encodeURIComponent(responseId)}` : ''
    }`
  }
}

submitButton?.addEventListener('click', async () => {
  if (isSubmitting) return
  const { errors, answers, answersOrdered } = collectAnswers()
  if (errors.length > 0) {
    setStatus('未回答の必須項目があります。', 'error')
    return
  }

  isSubmitting = true
  submitButton.disabled = true
  const hasEndpoint = Boolean(surveyResultsConfig.endpointUrl)
  const submissionTimestamp = new Date().toISOString()
  const responseId = generateResponseId()

  try {
    if (hasEndpoint) {
      setStatus('回答結果を送信しています…')
      await sendSurveyResults(answers, answersOrdered, submissionTimestamp, responseId)
    }
    setStatus('')
    storeLastSubmissionInfo(FORM_KEY, submissionTimestamp, responseId)
    // eslint-disable-next-line no-console
    console.log(`${FORM_KEY} answers`, answersOrdered)
    redirectToGenerator(submissionTimestamp, responseId)
  } catch (error) {
    console.error(error)
    setStatus(error.message || '回答の送信に失敗しました。時間をおいて再度お試しください。', 'error')
  } finally {
    isSubmitting = false
    submitButton.disabled = false
  }
})

maybeShowWelcomePopup()
initializeForm()
