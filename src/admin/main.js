const DEFAULT_LABELS = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
}

const DEFAULT_FAVICON_PATH = '/vite.svg'
const MAX_FAVICON_SIZE = 1024 * 1024 // 1MBまで
const MAX_HEADER_IMAGE_SIZE = 2 * 1024 * 1024 // 2MBまで

let loadedConfig = null
const brandingData = {
  logoDataUrl: '',
  headerImageDataUrl: '',
}

const TIERS = [
  {
    key: 'beginner',
    defaultLabel: DEFAULT_LABELS.beginner,
    description: '初めての口コミ投稿におすすめのステップです。',
  },
  {
    key: 'intermediate',
    defaultLabel: DEFAULT_LABELS.intermediate,
    description: '撮影や投稿に慣れてきた方向けの質問セットです。',
  },
  {
    key: 'advanced',
    defaultLabel: DEFAULT_LABELS.advanced,
    description: '高い熱量でご協力いただけるお客さま向けのフルセットです。',
  },
]

const PROMPT_CONFIGS = [
  { key: 'page1', label: '生成ページ1（初級）' },
  { key: 'page2', label: '生成ページ2（中級）' },
  { key: 'page3', label: '生成ページ3（上級）' },
]

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

const SURVEY_FORM_DEFAULTS = {
  form1: DEFAULT_FORM1,
}

const QUESTION_TYPES = [
  { value: 'dropdown', label: 'ドロップダウン' },
  { value: 'checkbox', label: 'チェックボックス' },
  { value: 'text', label: 'テキスト入力' },
  { value: 'rating', label: '数字選択' },
]

const RATING_STYLES = [
  { value: 'stars', label: '星（★）' },
  { value: 'numbers', label: '数字（1〜5）' },
]

const normalizeQuestionType = (value) => {
  if (value === 'checkbox') return 'checkbox'
  if (value === 'text') return 'text'
  if (value === 'rating') return 'rating'
  return 'dropdown'
}

const normalizeRatingStyle = (value) => (value === 'numbers' ? 'numbers' : 'stars')

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `survey-q-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

const sanitizeOptionsList = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const app = document.querySelector('#admin-app')
if (!app) {
  throw new Error('#admin-app が見つかりません。')
}

const appRole = app.dataset.appRole || 'user'
const isAdminApp = appRole === 'admin'
const isUserApp = appRole === 'user'

const form = app.querySelector('#config-form')
const statusEl = app.querySelector('[data-role="status"]')
const tabMenuContainer = app.querySelector('[data-role="tab-menu-container"]')
const tabMenuTrigger = app.querySelector('[data-role="tab-menu-trigger"]')
const tabMenu = app.querySelector('[data-role="tab-menu"]')
const STATUS_VISIBLE_CLASS = 'admin__status--visible'
let statusHideTimer = null

if (!form || !statusEl) {
  throw new Error('管理画面の必須要素が見つかりません。')
}

const tabButtons = Array.from(app.querySelectorAll('[data-tab-target]'))
const tabPanels = Array.from(app.querySelectorAll('[data-tab-panel]'))

const surveyResultsFields = {
  spreadsheetUrl: form.elements.surveySpreadsheetUrl,
  endpointUrl: form.elements.surveyEndpointUrl,
  apiKey: form.elements.surveyApiKey,
}

const userDataFields = {
  spreadsheetUrl: form.elements.userDataSpreadsheetUrl,
  submitGasUrl: form.elements.userDataSubmitGasUrl,
  readGasUrl: form.elements.userDataReadGasUrl,
}


const aiFields = {
  geminiApiKey: form.elements.geminiApiKey,
  mapsLink: form.elements.mapsLink,
  model: form.elements.model,
}

const promptFields = PROMPT_CONFIGS.map(({ key }) => ({
  key,
  gasUrl: form.elements[`prompt_${key}_gasUrl`],
  prompt: form.elements[`prompt_${key}_prompt`],
}))

const getPromptFieldByKey = (key) => promptFields.find((field) => field.key === key)

const USER_PROFILE_FIELD_COUNT = 5

const createProfileFieldArray = (prefix) =>
  Array.from({ length: USER_PROFILE_FIELD_COUNT }, (_, index) => form.elements[`${prefix}${index + 1}`])

const userProfileFields = {
  storeName: form.elements.profileStoreName,
  storeKana: form.elements.profileStoreKana,
  industry: form.elements.profileIndustry,
  customers: form.elements.profileCustomers,
  strengths: form.elements.profileStrengths,
  keywords: createProfileFieldArray('profileKeyword'),
  excludeWords: createProfileFieldArray('profileExcludeWord'),
  nearStation: form.elements.profileNearStation,
  nearStationStatus: app.querySelector('[data-role="profile-near-station-status"]'),
  referencePrompt: form.elements.referencePrompt,
  admin: {
    name: form.elements.profileAdminName,
    email: form.elements.profileAdminEmail,
    password: form.elements.profileAdminPassword,
    passwordConfirm: form.elements.profileAdminPasswordConfirm,
    toggle: form.elements.profileAdminPasswordToggle,
    status: app.querySelector('[data-role="profile-admin-password-status"]'),
  },
}

const getStoredUserProfileValue = (key) =>
  typeof loadedConfig?.userProfile?.[key] === 'string' ? loadedConfig.userProfile[key] : ''

const getStoredUserDataSetting = (key) =>
  typeof loadedConfig?.userDataSettings?.[key] === 'string' ? loadedConfig.userDataSettings[key] : ''

const cloneQuestion = (question) => ({
  ...question,
  options: Array.isArray(question.options) ? [...question.options] : [],
  placeholder: typeof question.placeholder === 'string' ? question.placeholder : '',
})

const setElementHidden = (element, hidden) => {
  if (!element) return
  element.classList.toggle('is-hidden', hidden)
}

const setToggleStatusText = (target, checked) => {
  if (!target) return
  target.textContent = checked ? 'ON' : 'OFF'
}

const getCurrentUserDataSettings = () => ({
  ...DEFAULT_USER_DATA_SETTINGS,
  ...(loadedConfig?.userDataSettings || {}),
})

const hasUserDataSyncConfig = () => {
  const settings = getCurrentUserDataSettings()
  return Boolean(settings.submitGasUrl && settings.spreadsheetUrl)
}

const syncUserProfileExternally = async (profile, options = {}) => {
  const settings = getCurrentUserDataSettings()
  if (!settings.submitGasUrl || !settings.spreadsheetUrl) {
    return { status: 'skipped' }
  }

  const metadata = {
    userId: typeof profile?.userId === 'string' ? profile.userId : '',
    createUserSheet: Boolean(options?.shouldCreateUserSheet && profile?.userId),
  }

  try {
    const response = await fetch('/.netlify/functions/user-data-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        metadata,
        origin: window.location.href,
        source: isUserApp ? 'user-app' : 'admin-app',
        submittedAt: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const message =
        payload?.message || '店舗情報の保存に失敗しました。時間をおいて再度お試しください。'
      return { status: 'error', message }
    }

    return { status: 'success' }
  } catch (error) {
    console.error('Failed to sync user profile:', error)
    return {
      status: 'error',
      message: '店舗情報の保存に失敗しました。ネットワーク状況をご確認ください。',
    }
  }
}

const setPasswordFieldType = (field, type) => {
  if (!field) return
  try {
    field.type = type
  } catch {
    // noop
  }
}

const updateAdminPasswordVisibility = () => {
  if (!userProfileFields.admin) return
  const isVisible = Boolean(userProfileFields.admin.toggle?.checked)
  const targetType = isVisible ? 'text' : 'password'
  setPasswordFieldType(userProfileFields.admin.password, targetType)
  setPasswordFieldType(userProfileFields.admin.passwordConfirm, targetType)
  if (userProfileFields.admin.status) {
    setToggleStatusText(userProfileFields.admin.status, isVisible)
  }
}

const hasUserProfileInputs = () =>
  Boolean(
    userProfileFields.storeName ||
      userProfileFields.storeKana ||
      userProfileFields.industry ||
      userProfileFields.customers ||
      userProfileFields.strengths ||
      userProfileFields.keywords.some(Boolean) ||
      userProfileFields.excludeWords.some(Boolean) ||
      userProfileFields.nearStation ||
      userProfileFields.referencePrompt ||
      (userProfileFields.admin &&
        (userProfileFields.admin.name ||
          userProfileFields.admin.email ||
          userProfileFields.admin.password ||
          userProfileFields.admin.passwordConfirm)),
  )

const setUserProfileValues = (profile = {}) => {
  if (!hasUserProfileInputs()) return
  const assign = (field, value = '') => {
    if (field) field.value = value || ''
  }

  assign(userProfileFields.storeName, profile.storeName)
  assign(userProfileFields.storeKana, profile.storeKana)
  assign(userProfileFields.industry, profile.industry)
  assign(userProfileFields.customers, profile.customers)
  assign(userProfileFields.strengths, profile.strengths)
  assign(userProfileFields.referencePrompt, profile.referencePrompt)

  const keywords = Array.isArray(profile.keywords) ? profile.keywords : []
  userProfileFields.keywords.forEach((field, index) => {
    assign(field, keywords[index] || '')
  })

  const excludeWords = Array.isArray(profile.excludeWords) ? profile.excludeWords : []
  userProfileFields.excludeWords.forEach((field, index) => {
    assign(field, excludeWords[index] || '')
  })

  const nearStation = Boolean(profile.nearStation)
  if (userProfileFields.nearStation) {
    userProfileFields.nearStation.checked = nearStation
  }
  if (userProfileFields.nearStationStatus) {
    setToggleStatusText(userProfileFields.nearStationStatus, nearStation)
  }

  const adminProfile = profile.admin || DEFAULT_USER_PROFILE.admin
  assign(userProfileFields.admin?.name, adminProfile.name)
  assign(userProfileFields.admin?.email, adminProfile.email)
  assign(userProfileFields.admin?.password, adminProfile.password)
  assign(userProfileFields.admin?.passwordConfirm, adminProfile.password)
  if (userProfileFields.admin?.toggle) {
    userProfileFields.admin.toggle.checked = false
  }
  updateAdminPasswordVisibility()
}

const collectProfileListValues = (fields) =>
  fields
    .map((field) => (field?.value || '').trim())
    .filter(Boolean)

const getUserProfilePayload = () => {
  const baseProfile = { ...(loadedConfig?.userProfile || DEFAULT_USER_PROFILE) }
  if (!hasUserProfileInputs()) {
    return baseProfile
  }

  const getValue = (field, fallback = '') => (field ? (field.value || '').trim() : fallback)
  const hasKeywordInputs = userProfileFields.keywords.some((field) => Boolean(field))
  const hasExcludeInputs = userProfileFields.excludeWords.some((field) => Boolean(field))

  const keywords = hasKeywordInputs
    ? collectProfileListValues(userProfileFields.keywords)
    : baseProfile.keywords || []

  const excludeWords = hasExcludeInputs
    ? collectProfileListValues(userProfileFields.excludeWords)
    : baseProfile.excludeWords || []

  return {
    storeName: getValue(userProfileFields.storeName, baseProfile.storeName || ''),
    storeKana: getValue(userProfileFields.storeKana, baseProfile.storeKana || ''),
    industry: getValue(userProfileFields.industry, baseProfile.industry || ''),
    customers: getValue(userProfileFields.customers, baseProfile.customers || ''),
    strengths: getValue(userProfileFields.strengths, baseProfile.strengths || ''),
    keywords,
    excludeWords,
    nearStation:
      userProfileFields.nearStation != null
        ? Boolean(userProfileFields.nearStation.checked)
        : Boolean(baseProfile.nearStation),
    referencePrompt: getValue(userProfileFields.referencePrompt, baseProfile.referencePrompt || ''),
    userId: typeof baseProfile.userId === 'string' ? baseProfile.userId : '',
    admin: {
      name: getValue(userProfileFields.admin?.name, baseProfile.admin?.name || ''),
      email: getValue(userProfileFields.admin?.email, baseProfile.admin?.email || ''),
      password: getValue(userProfileFields.admin?.password, baseProfile.admin?.password || ''),
    },
  }
}

const sanitizeSurveyQuestionsConfig = (questions, fallbackQuestions) => {
  const fallback = Array.isArray(fallbackQuestions) ? fallbackQuestions : []

  if (!Array.isArray(questions)) {
    return fallback.map((question) => cloneQuestion(question))
  }

  const sanitized = questions
    .map((question) => {
      const normalized = createSurveyQuestion(question)
      normalized.title = (normalized.title || '').trim()
      normalized.options = normalized.options.map((option) => option.trim()).filter(Boolean)

      const requiresOptions = normalized.type === 'dropdown' || normalized.type === 'checkbox'
      if (requiresOptions && normalized.options.length === 0) {
        return null
      }

      if (!requiresOptions) {
        normalized.options = []
      }

      if (normalized.type !== 'checkbox') {
        normalized.allowMultiple = false
      }

      if (normalized.type === 'rating') {
        normalized.ratingStyle = normalizeRatingStyle(normalized.ratingStyle)
      } else {
        normalized.ratingStyle = 'stars'
      }

      if (normalized.type !== 'text') {
        normalized.placeholder = ''
      }
      normalized.includeInReview = typeof normalized.includeInReview === 'boolean' ? normalized.includeInReview : true

      return normalized
    })
    .filter(Boolean)

  return sanitized.length > 0 ? sanitized : fallback.map((question) => cloneQuestion(question))
}

const createSurveyQuestion = (overrides = {}) => {
  const type = normalizeQuestionType(overrides.type)
  const optionsSource = Array.isArray(overrides.options) ? overrides.options : []
  const normalizedOptions = optionsSource.length > 0 ? optionsSource : ['選択肢1', '選択肢2']

  const question = {
    id: overrides.id || createQuestionId(),
    title: typeof overrides.title === 'string' ? overrides.title : '',
    required: typeof overrides.required === 'boolean' ? overrides.required : true,
    type,
    allowMultiple: type === 'checkbox' ? Boolean(overrides.allowMultiple) : false,
    options: normalizedOptions.map((option) => option.trim()).filter(Boolean),
    ratingEnabled: typeof overrides.ratingEnabled === 'boolean' ? overrides.ratingEnabled : false,
    placeholder: typeof overrides.placeholder === 'string' ? overrides.placeholder : '',
    ratingStyle: normalizeRatingStyle(overrides.ratingStyle),
    includeInReview: typeof overrides.includeInReview === 'boolean' ? overrides.includeInReview : true,
  }

  if (question.type !== 'text' && question.options.length === 0) {
    question.options = ['選択肢1']
  }

  if (question.type === 'text') {
    question.options = []
  }

  if (question.type !== 'rating') {
    question.ratingStyle = 'stars'
  }

  if (typeof question.includeInReview !== 'boolean') {
    question.includeInReview = true
  }

  return question
}

function createSurveyFormManager({ key, fields, questionListEl, addButton, defaults }) {
  const fallbackQuestions = defaults?.questions || []
  let questions = fallbackQuestions.map((question) => cloneQuestion(question))
  let isDirty = false

  const markDirty = () => {
    isDirty = true
  }

  if (fields?.title) {
    fields.title.addEventListener('input', markDirty)
  }
  if (fields?.lead) {
    fields.lead.addEventListener('input', markDirty)
  }

  const setQuestions = (nextQuestions) => {
    questions = sanitizeSurveyQuestionsConfig(nextQuestions, fallbackQuestions)
    isDirty = false
    renderQuestions()
  }

  const removeQuestion = (questionId) => {
    questions = questions.filter((question) => question.id !== questionId)
    markDirty()
    renderQuestions()
  }

  const handleAddQuestion = () => {
    questions.push(
      createSurveyQuestion({
        title: '',
        options: ['選択肢1', '選択肢2'],
      }),
    )
    markDirty()
    renderQuestions()
  }

  const buildQuestionElement = (question, index) => {
    const wrapper = document.createElement('article')
    wrapper.className = 'admin__question'
    wrapper.dataset.questionId = question.id

    const header = document.createElement('div')
    header.className = 'admin__question-header'

    const title = document.createElement('p')
    title.className = 'admin__question-title'
    title.textContent = `設問${index + 1}`
    header.appendChild(title)

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'admin__icon-button admin__icon-button--danger'
    removeButton.innerHTML = '<span aria-hidden="true" class="admin__icon-trash">🗑</span><span>削除</span>'
    removeButton.addEventListener('click', () => removeQuestion(question.id))
    header.appendChild(removeButton)

    wrapper.appendChild(header)

    const fieldsWrapper = document.createElement('div')
    fieldsWrapper.className = 'admin__fields admin__fields--single'

    const titleField = document.createElement('label')
    titleField.className = 'admin__field'
    titleField.innerHTML = '<span class="admin__field-label">質問内容</span>'
    const titleInput = document.createElement('input')
    titleInput.type = 'text'
    titleInput.placeholder = '例：今回のご利用目的を教えてください'
    titleInput.value = question.title
    titleInput.addEventListener('input', () => {
      question.title = titleInput.value
      markDirty()
    })
    titleField.appendChild(titleInput)
    fieldsWrapper.appendChild(titleField)

    const typeField = document.createElement('label')
    typeField.className = 'admin__field'
    typeField.innerHTML = '<span class="admin__field-label">回答形式</span>'
    const typeSelect = document.createElement('select')
    QUESTION_TYPES.forEach(({ value, label }) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      typeSelect.appendChild(option)
    })
    typeSelect.value = normalizeQuestionType(question.type)
    typeSelect.addEventListener('change', () => {
      question.type = normalizeQuestionType(typeSelect.value)
      markDirty()
      refreshQuestionState()
    })
    typeField.appendChild(typeSelect)
    const typeHint = document.createElement('span')
    typeHint.className = 'admin__field-hint'
    typeHint.textContent = ''
    typeField.appendChild(typeHint)
    fieldsWrapper.appendChild(typeField)

    const ratingStyleField = document.createElement('label')
    ratingStyleField.className = 'admin__field'
    ratingStyleField.innerHTML = '<span class="admin__field-label">数字選択の表示</span>'
    const ratingStyleSelect = document.createElement('select')
    RATING_STYLES.forEach(({ value, label }) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      ratingStyleSelect.appendChild(option)
    })
    ratingStyleSelect.value = normalizeRatingStyle(question.ratingStyle)
    ratingStyleSelect.addEventListener('change', () => {
      question.ratingStyle = normalizeRatingStyle(ratingStyleSelect.value)
      markDirty()
    })
    ratingStyleField.appendChild(ratingStyleSelect)
    const ratingStyleHint = document.createElement('span')
    ratingStyleHint.className = 'admin__field-hint'
    ratingStyleHint.textContent = '星（★）と数字ボタンのどちらで回答してもらうか選択できます。'
    ratingStyleField.appendChild(ratingStyleHint)
    fieldsWrapper.appendChild(ratingStyleField)

    const optionsField = document.createElement('label')
    optionsField.className = 'admin__field'
    optionsField.innerHTML = '<span class="admin__field-label">選択肢（1行につき1項目）</span>'
    const optionsTextarea = document.createElement('textarea')
    optionsTextarea.rows = 4
    optionsTextarea.placeholder = '例：ビジネス'
    optionsTextarea.value = question.options.join('\n')
    optionsTextarea.addEventListener('input', () => {
      const next = sanitizeOptionsList(optionsTextarea.value)
      question.options = next.length > 0 ? next : []
      markDirty()
    })
    optionsField.appendChild(optionsTextarea)
    const optionsHint = document.createElement('span')
    optionsHint.className = 'admin__field-hint'
    optionsHint.textContent = 'ドロップダウン／チェックボックスで表示される回答候補です。空行は無視されます。'
    optionsField.appendChild(optionsHint)
    fieldsWrapper.appendChild(optionsField)

    const placeholderField = document.createElement('label')
    placeholderField.className = 'admin__field'
    placeholderField.innerHTML = '<span class="admin__field-label">プレースホルダー</span>'
    const placeholderInput = document.createElement('input')
    placeholderInput.type = 'text'
    placeholderInput.placeholder = '例：自由にご記入ください。'
    placeholderInput.value = question.placeholder || ''
    placeholderInput.addEventListener('input', () => {
      question.placeholder = placeholderInput.value
      markDirty()
    })
    placeholderField.appendChild(placeholderInput)
    const placeholderHint = document.createElement('span')
    placeholderHint.className = 'admin__field-hint'
    placeholderHint.textContent = 'テキスト入力形式の補足文として表示されます。'
    placeholderField.appendChild(placeholderHint)
    fieldsWrapper.appendChild(placeholderField)

    wrapper.appendChild(fieldsWrapper)

    const settings = document.createElement('div')
    settings.className = 'admin__question-settings'

    const requiredToggle = document.createElement('label')
    requiredToggle.className = 'admin__toggle admin__toggle--compact'
    const requiredLabel = document.createElement('span')
    requiredLabel.className = 'admin__toggle-label'
    requiredLabel.textContent = '必須回答'
    requiredToggle.appendChild(requiredLabel)
    const requiredControl = document.createElement('span')
    requiredControl.className = 'admin__toggle-control'
    const requiredInput = document.createElement('input')
    requiredInput.type = 'checkbox'
    requiredInput.className = 'admin__toggle-input'
    requiredInput.checked = question.required
    const requiredTrack = document.createElement('span')
    requiredTrack.className = 'admin__toggle-track'
    const requiredThumb = document.createElement('span')
    requiredThumb.className = 'admin__toggle-thumb'
    requiredTrack.appendChild(requiredThumb)
    const requiredStatus = document.createElement('span')
    requiredStatus.className = 'admin__toggle-status'
    setToggleStatusText(requiredStatus, question.required)
    requiredInput.addEventListener('change', () => {
      question.required = requiredInput.checked
      setToggleStatusText(requiredStatus, requiredInput.checked)
      markDirty()
    })
    requiredControl.append(requiredInput, requiredTrack, requiredStatus)
    requiredToggle.appendChild(requiredControl)
    settings.appendChild(requiredToggle)

    const reviewToggle = document.createElement('label')
    reviewToggle.className = 'admin__toggle admin__toggle--compact'
    const reviewLabel = document.createElement('span')
    reviewLabel.className = 'admin__toggle-label'
    reviewLabel.textContent = 'プロンプトに反映'
    reviewToggle.appendChild(reviewLabel)
    const reviewControl = document.createElement('span')
    reviewControl.className = 'admin__toggle-control'
    const reviewInput = document.createElement('input')
    reviewInput.type = 'checkbox'
    reviewInput.className = 'admin__toggle-input'
    reviewInput.checked = question.includeInReview !== false
    const reviewTrack = document.createElement('span')
    reviewTrack.className = 'admin__toggle-track'
    const reviewThumb = document.createElement('span')
    reviewThumb.className = 'admin__toggle-thumb'
    reviewTrack.appendChild(reviewThumb)
    const reviewStatus = document.createElement('span')
    reviewStatus.className = 'admin__toggle-status'
    setToggleStatusText(reviewStatus, reviewInput.checked)
    reviewInput.addEventListener('change', () => {
      question.includeInReview = reviewInput.checked
      setToggleStatusText(reviewStatus, reviewInput.checked)
      markDirty()
    })
    reviewControl.append(reviewInput, reviewTrack, reviewStatus)
    reviewToggle.appendChild(reviewControl)
    settings.appendChild(reviewToggle)

    const multipleWrapper = document.createElement('label')
    multipleWrapper.className = 'admin__checkbox'
    const multipleInput = document.createElement('input')
    multipleInput.type = 'checkbox'
    multipleInput.checked = question.allowMultiple
    multipleWrapper.appendChild(multipleInput)
    const multipleLabel = document.createElement('span')
    multipleLabel.textContent = '複数回答可'
    multipleWrapper.appendChild(multipleLabel)
    settings.appendChild(multipleWrapper)

    const ratingStyleFieldWrapper = ratingStyleField

    const refreshQuestionState = () => {
      const isCheckbox = question.type === 'checkbox'
      const isText = question.type === 'text'
      const isRating = question.type === 'rating'
      const requiresOptions = question.type === 'dropdown' || question.type === 'checkbox'

      if (!isCheckbox) {
        multipleInput.checked = false
        multipleInput.disabled = true
        question.allowMultiple = false
        multipleWrapper.classList.add('is-disabled')
      } else {
        multipleInput.disabled = false
        multipleWrapper.classList.remove('is-disabled')
        multipleInput.checked = question.allowMultiple
      }

      setElementHidden(optionsField, !requiresOptions)
      optionsTextarea.disabled = !requiresOptions
      setElementHidden(placeholderField, !isText)
      placeholderInput.disabled = !isText
      setElementHidden(ratingStyleFieldWrapper, !isRating)
      ratingStyleSelect.disabled = !isRating
    }

    multipleInput.addEventListener('change', () => {
      question.allowMultiple = multipleInput.checked
      markDirty()
    })

    refreshQuestionState()

    wrapper.appendChild(settings)

    const helper = document.createElement('p')
    helper.className = 'admin__options-hint is-hidden'
    helper.textContent = ''
    wrapper.appendChild(helper)

    return wrapper
  }

  const renderQuestions = () => {
    if (!questionListEl) return
    questionListEl.innerHTML = ''

    if (questions.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'admin__options-hint'
      empty.textContent = '設問がありません。「設問を追加」ボタンから新しい設問を作成してください。'
      questionListEl.appendChild(empty)
      return
    }

    questions.forEach((question, index) => {
      questionListEl.appendChild(buildQuestionElement(question, index))
    })
  }

  const getPayloadQuestions = () =>
    questions
      .map((question) => {
        const type = normalizeQuestionType(question.type)
        const requiresOptions = type === 'dropdown' || type === 'checkbox'
        const options = requiresOptions
          ? (question.options || []).map((option) => option.trim()).filter(Boolean)
          : []
        return {
          id: question.id || createQuestionId(),
          title: (question.title || '').trim(),
          required: Boolean(question.required),
          type,
          allowMultiple: type === 'checkbox' ? Boolean(question.allowMultiple) : false,
          options,
          ratingEnabled: false,
          ratingStyle: type === 'rating' ? normalizeRatingStyle(question.ratingStyle) : 'stars',
          placeholder: type === 'text' ? (question.placeholder || '').trim() : '',
          includeInReview: typeof question.includeInReview === 'boolean' ? question.includeInReview : true,
        }
      })
      .filter((question) => {
        if (question.type === 'text' || question.type === 'rating') {
          return Boolean(question.title)
        }
        return question.title && question.options.length > 0
      })

  addButton?.addEventListener('click', handleAddQuestion)
  renderQuestions()

  const getStoredFormConfig = () => {
    const stored = loadedConfig?.[key]
    if (stored && typeof stored === 'object') {
      return stored
    }
    return {}
  }

  const resolveFieldValue = (field, storedValue, defaultValue) => {
    const rawValue = typeof field?.value === 'string' ? field.value.trim() : ''
    if (field) {
      return rawValue || defaultValue
    }
    return rawValue || storedValue || defaultValue
  }

  return {
    key,
    defaults,
    fields,
    setQuestions,
    isDirty: () => isDirty,
    load: (config = {}) => {
      if (fields.title) {
        fields.title.value = config.title || defaults.title
      }
      if (fields.lead) {
        fields.lead.value = config.description || defaults.description
      }
      setQuestions(config.questions)
    },
    toPayload: () => {
      const storedConfig = getStoredFormConfig()
      const titleValue = resolveFieldValue(
        fields.title,
        typeof storedConfig.title === 'string' ? storedConfig.title : '',
        defaults.title,
      )
      const leadValue = resolveFieldValue(
        fields.lead,
        typeof storedConfig.description === 'string' ? storedConfig.description : '',
        defaults.description,
      )
      const questionPayload = getPayloadQuestions()
      return {
        title: titleValue,
        description: leadValue,
        questions:
          questionPayload.length > 0
            ? questionPayload
            : fallbackQuestions.map((question) => cloneQuestion(question)),
      }
    },
  }
}

const surveyFormConfigs = [
  {
    key: 'form1',
    fields: {
      title: form.elements.form1Title,
      lead: form.elements.form1Lead,
    },
    questionListEl: app.querySelector('[data-role="form1-question-list"]'),
    addButton: app.querySelector('[data-role="form1-add-question"]'),
    defaults: DEFAULT_FORM1,
  },
]

const surveyFormManagers = surveyFormConfigs.reduce((acc, config) => {
  const manager = createSurveyFormManager(config)
  if (manager) {
    acc[config.key] = manager
  }
  return acc
}, {})

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

const brandingFields = {
  fileInput: form.elements.brandingLogo || form.elements.brandingFavicon,
  dataInput: form.elements.brandingLogoData || form.elements.brandingFaviconData,
  preview: app.querySelector('[data-role="favicon-preview"]'),
  removeButton: app.querySelector('[data-role="favicon-remove"]'),
}

const headerImageFields = {
  fileInput: form.elements.brandingHeaderImage,
  dataInput: form.elements.brandingHeaderImageData,
  preview: app.querySelector('[data-role="header-image-preview"]'),
  removeButton: app.querySelector('[data-role="header-image-remove"]'),
  placeholder: app.querySelector('[data-role="header-image-placeholder"]'),
}

const applyBrandingToUI = (value) => {
  const dataUrl = typeof value === 'string' ? value : ''
  brandingData.logoDataUrl = dataUrl
  if (brandingFields.dataInput) {
    brandingFields.dataInput.value = dataUrl
  }
  if (brandingFields.preview) {
    brandingFields.preview.src = dataUrl || DEFAULT_FAVICON_PATH
    brandingFields.preview.alt = dataUrl ? '現在のロゴ' : 'デフォルトロゴ'
  }
  setDocumentFavicon(dataUrl)
}

const applyHeaderImageToUI = (value) => {
  const dataUrl = typeof value === 'string' ? value : ''
  brandingData.headerImageDataUrl = dataUrl
  if (headerImageFields.dataInput) {
    headerImageFields.dataInput.value = dataUrl
  }
  if (headerImageFields.preview) {
    if (dataUrl) {
      headerImageFields.preview.src = dataUrl
      headerImageFields.preview.removeAttribute('hidden')
    } else {
      headerImageFields.preview.setAttribute('hidden', '')
      headerImageFields.preview.removeAttribute('src')
    }
  }
  if (headerImageFields.placeholder) {
    if (dataUrl) {
      headerImageFields.placeholder.setAttribute('hidden', '')
    } else {
      headerImageFields.placeholder.removeAttribute('hidden')
    }
  }
}

const handleBrandingFileChange = () => {
  const file = brandingFields.fileInput?.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    setStatus('画像ファイルを選択してください。', 'error')
    brandingFields.fileInput.value = ''
    return
  }

  if (file.size > MAX_FAVICON_SIZE) {
    const sizeKB = Math.round(MAX_FAVICON_SIZE / 1024)
    setStatus(`ファビコン画像は${sizeKB}KB以内のファイルを選択してください。`, 'error')
    brandingFields.fileInput.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      applyBrandingToUI(reader.result)
    }
  }
  reader.onerror = () => {
    setStatus('画像の読み込みに失敗しました。別のファイルをお試しください。', 'error')
  }
  reader.readAsDataURL(file)
}

const handleBrandingRemove = () => {
  if (brandingFields.fileInput) {
    brandingFields.fileInput.value = ''
  }
  applyBrandingToUI('')
}

const getBrandingValue = () =>
  brandingData.logoDataUrl || brandingFields.dataInput?.value?.trim() || ''

const handleHeaderImageFileChange = () => {
  const file = headerImageFields.fileInput?.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    setStatus('ヘッダー画像には画像ファイルを選択してください。', 'error')
    headerImageFields.fileInput.value = ''
    return
  }

  if (file.size > MAX_HEADER_IMAGE_SIZE) {
    const sizeMB = (MAX_HEADER_IMAGE_SIZE / (1024 * 1024)).toFixed(1)
    setStatus(`ヘッダー画像は${sizeMB}MB以内のファイルを選択してください。`, 'error')
    headerImageFields.fileInput.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      applyHeaderImageToUI(reader.result)
    }
  }
  reader.onerror = () => {
    setStatus('ヘッダー画像の読み込みに失敗しました。別のファイルをお試しください。', 'error')
  }
  reader.readAsDataURL(file)
}

const handleHeaderImageRemove = () => {
  if (headerImageFields.fileInput) {
    headerImageFields.fileInput.value = ''
  }
  applyHeaderImageToUI('')
}

const getHeaderImageValue = () =>
  brandingData.headerImageDataUrl || headerImageFields.dataInput?.value?.trim() || ''

const setTabMenuState = (isOpen) => {
  if (!tabMenu || !tabMenuTrigger) return
  tabMenu.classList.toggle('is-open', isOpen)
  tabMenuTrigger.setAttribute('aria-expanded', String(isOpen))
  tabMenu.setAttribute('aria-hidden', String(!isOpen))
}

const closeTabMenu = () => {
  if (!tabMenu?.classList.contains('is-open')) return
  setTabMenuState(false)
}

const clearStatusHideTimer = () => {
  if (statusHideTimer) {
    clearTimeout(statusHideTimer)
    statusHideTimer = null
  }
}

const setStatus = (message, type = 'info', options = {}) => {
  const { autoHide = true, duration = 2000 } = options
  if (!message) {
    statusEl.textContent = ''
    statusEl.dataset.type = ''
    statusEl.classList.remove(STATUS_VISIBLE_CLASS)
    clearStatusHideTimer()
    return
  }

  statusEl.textContent = message
  statusEl.dataset.type = type
  statusEl.classList.remove(STATUS_VISIBLE_CLASS)
  // Force reflow so repeated messages retrigger the transition
  void statusEl.offsetWidth
  statusEl.classList.add(STATUS_VISIBLE_CLASS)
  clearStatusHideTimer()
  if (autoHide) {
    statusHideTimer = setTimeout(() => {
      statusEl.classList.remove(STATUS_VISIBLE_CLASS)
      statusEl.textContent = ''
      statusEl.dataset.type = ''
      statusHideTimer = null
    }, duration)
  }
}

const waitForStatusPaint = () =>
  new Promise((resolve) => {
    const schedule = typeof window !== 'undefined' && window.requestAnimationFrame
    if (schedule) {
      window.requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 16)
    }
  })

// 以前のUIの名残で参照されており、存在しないためにReferenceErrorを出していた
const hidePromptPopover = () => {}

const activateTab = (target) => {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === target
    button.classList.toggle('is-active', isActive)
  })

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === target
    panel.classList.toggle('is-active', isActive)
  })

  hidePromptPopover()
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activateTab(button.dataset.tabTarget)
    closeTabMenu()
  })
})

if (tabMenu && tabMenuTrigger && tabMenuContainer) {
  setTabMenuState(false)

  tabMenuTrigger.addEventListener('click', () => {
    const isOpen = tabMenu.classList.contains('is-open')
    setTabMenuState(!isOpen)
  })

  document.addEventListener('click', (event) => {
    if (!tabMenuContainer.contains(event.target)) {
      closeTabMenu()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTabMenu()
    }
  })
}

if (brandingFields.fileInput) {
  brandingFields.fileInput.addEventListener('change', handleBrandingFileChange)
}
if (brandingFields.removeButton) {
  brandingFields.removeButton.addEventListener('click', handleBrandingRemove)
}
if (headerImageFields.fileInput) {
  headerImageFields.fileInput.addEventListener('change', handleHeaderImageFileChange)
}
if (headerImageFields.removeButton) {
  headerImageFields.removeButton.addEventListener('click', handleHeaderImageRemove)
}

if (userProfileFields.nearStation) {
  userProfileFields.nearStation.addEventListener('change', () => {
    setToggleStatusText(userProfileFields.nearStationStatus, userProfileFields.nearStation.checked)
  })
}

if (userProfileFields.admin?.toggle) {
  userProfileFields.admin.toggle.addEventListener('change', () => {
    updateAdminPasswordVisibility()
  })
  updateAdminPasswordVisibility()
} else {
  updateAdminPasswordVisibility()
}

if (tabButtons.length > 0) {
  activateTab(tabButtons[0].dataset.tabTarget)
}

function populateForm(config) {
  loadedConfig = config
  TIERS.forEach(({ key, defaultLabel }) => {
    const labelInput = form.elements[`${key}Label`]
    const linksInput = form.elements[`${key}Links`]

    if (labelInput) {
      labelInput.value = config.labels?.[key] ?? defaultLabel
    }

    if (linksInput) {
      const links = config.tiers?.[key]?.links ?? []
      linksInput.value = links.join('\n')
    }
  })

  const ai = config.aiSettings || {}
  if (aiFields.geminiApiKey) {
    if (ai.hasGeminiApiKey) {
      aiFields.geminiApiKey.value = '******'
      aiFields.geminiApiKey.placeholder = '登録済みのキーがあります。更新する場合は新しいキーを入力'
      aiFields.geminiApiKey.dataset.registered = 'true'
    } else {
      aiFields.geminiApiKey.value = ai.geminiApiKey || ''
      aiFields.geminiApiKey.placeholder = '例: AIza...'
      delete aiFields.geminiApiKey.dataset.registered
    }
  }
  if (aiFields.mapsLink) aiFields.mapsLink.value = ai.mapsLink || ''
  if (aiFields.model) aiFields.model.value = ai.model || ''

  setUserProfileValues(config.userProfile || {})

  const prompts = config.prompts || {}
  promptFields.forEach(({ key, gasUrl, prompt }) => {
    const promptConfig = prompts[key] || {}
    if (gasUrl) gasUrl.value = promptConfig.gasUrl || ''
    if (prompt) prompt.value = promptConfig.prompt || ''
  })

  const surveyResults = {
    ...DEFAULT_SURVEY_RESULTS,
    ...(config.surveyResults || {}),
  }
  if (surveyResultsFields.spreadsheetUrl) {
    surveyResultsFields.spreadsheetUrl.value = surveyResults.spreadsheetUrl || ''
  }
  if (surveyResultsFields.endpointUrl) {
    surveyResultsFields.endpointUrl.value = surveyResults.endpointUrl || ''
  }
  if (surveyResultsFields.apiKey) {
    surveyResultsFields.apiKey.value = surveyResults.apiKey || ''
  }

  const userDataSettings = {
    ...DEFAULT_USER_DATA_SETTINGS,
    ...(config.userDataSettings || {}),
  }
  if (userDataFields.spreadsheetUrl) {
    userDataFields.spreadsheetUrl.value = userDataSettings.spreadsheetUrl || ''
  }
  if (userDataFields.submitGasUrl) {
    userDataFields.submitGasUrl.value = userDataSettings.submitGasUrl || ''
  }
  if (userDataFields.readGasUrl) {
    userDataFields.readGasUrl.value = userDataSettings.readGasUrl || ''
  }

  surveyFormConfigs.forEach(({ key }) => {
    const manager = surveyFormManagers[key]
    if (!manager) return
    const defaults = SURVEY_FORM_DEFAULTS[key] || DEFAULT_FORM1
    const formConfig = config[key] || defaults
    manager.load(formConfig)
  })

  const branding = config.branding || {}
  applyBrandingToUI(branding.logoDataUrl || branding.faviconDataUrl || '')
  applyHeaderImageToUI(branding.headerImageDataUrl || '')
}

const loadConfig = async () => {
  setStatus('設定を読み込み中です…')
  try {
    const response = await fetch('/.netlify/functions/config')
    if (!response.ok) {
      throw new Error('設定の取得に失敗しました。ネットワーク状況をご確認ください。')
    }
    const payload = await response.json()
    populateForm(payload)
    setStatus('最新の設定を読み込みました。', 'success')
  } catch (error) {
    console.error(error)
    const cached = readCachedConfig()
    if (cached) {
      populateForm(cached)
    }
    setStatus(error.message, 'error')
  }
}

const parseLinks = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const hasInvalidUrl = (value) => {
  try {
    if (!value) return false
    // eslint-disable-next-line no-new
    new URL(value)
    return false
  } catch {
    return true
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  setStatus('設定を保存しています…', 'info', { autoHide: false })
  await waitForStatusPaint()
  const existingPrompts = { ...(loadedConfig?.prompts || {}) }
  const canEditUserDataSettings = Boolean(
    userDataFields.spreadsheetUrl || userDataFields.submitGasUrl || userDataFields.readGasUrl,
  )
  const existingUserDataSettings = { ...(loadedConfig?.userDataSettings || {}) }

  const payload = {
    labels: { ...(loadedConfig?.labels || {}) },
    tiers: { ...(loadedConfig?.tiers || {}) },
    aiSettings: { ...(loadedConfig?.aiSettings || {}) },
    prompts: {},
    branding: { ...(loadedConfig?.branding || {}) },
    surveyResults: {
      ...DEFAULT_SURVEY_RESULTS,
      ...(loadedConfig?.surveyResults || {}),
    },
    userDataSettings: canEditUserDataSettings
      ? {
          ...DEFAULT_USER_DATA_SETTINGS,
          ...existingUserDataSettings,
        }
      : undefined,
    userProfile: { ...(loadedConfig?.userProfile || {}) },
  }
  const errors = []

  TIERS.forEach(({ key, defaultLabel }) => {
    const labelInput = form.elements[`${key}Label`]
    const linksInput = form.elements[`${key}Links`]

    if (labelInput) {
      payload.labels[key] = labelInput.value.trim() || defaultLabel
    } else if (!payload.labels[key]) {
      payload.labels[key] = defaultLabel
    }

    if (linksInput) {
      const links = parseLinks(linksInput.value)
      const invalidLink = links.find(hasInvalidUrl)
      if (invalidLink) {
        errors.push(`${defaultLabel}リンクのURL形式が正しくありません: ${invalidLink}`)
      }
      payload.tiers[key] = { links }
    } else if (!payload.tiers[key]) {
      payload.tiers[key] = { links: [] }
    }
  })

  const aiSettings = { ...(payload.aiSettings || {}) }
  aiSettings.geminiApiKey = ''
  if (aiFields.geminiApiKey) {
    const geminiValue = (aiFields.geminiApiKey.value || '').trim()
    if (geminiValue && geminiValue !== '******') {
      aiSettings.geminiApiKey = geminiValue
    }
  }
  if (aiFields.model) {
    aiSettings.model = (aiFields.model.value || '').trim()
  }
  if (aiFields.mapsLink) {
    aiSettings.mapsLink = (aiFields.mapsLink.value || '').trim()

    if (aiSettings.mapsLink) {
      try {
        // eslint-disable-next-line no-new
        new URL(aiSettings.mapsLink)
      } catch {
        errors.push('Googleマップリンク のURL形式が正しくありません。')
      }
    }
  }

  payload.aiSettings = aiSettings

  promptFields.forEach(({ key, gasUrl, prompt }) => {
    const hasGasField = Boolean(gasUrl)
    const hasPromptField = Boolean(prompt)
    if (!hasGasField && !hasPromptField) {
      return
    }

    const current = {}
    const label = PROMPT_CONFIGS.find((item) => item.key === key)?.label || key

    if (hasGasField) {
      const gasValue = (gasUrl.value || '').trim()
      if (gasValue) {
        try {
          // eslint-disable-next-line no-new
          new URL(gasValue)
        } catch {
          errors.push(`${label} のGASアプリURL形式が正しくありません。`)
        }
      }
      current.gasUrl = gasValue
    }

    if (hasPromptField) {
      current.prompt = (prompt.value || '').trim()
    }

    payload.prompts[key] = current
  })

  const surveyResults = { ...(payload.surveyResults || DEFAULT_SURVEY_RESULTS) }
  if (surveyResultsFields.spreadsheetUrl) {
    surveyResults.spreadsheetUrl = (surveyResultsFields.spreadsheetUrl.value || '').trim()
    if (surveyResults.spreadsheetUrl && hasInvalidUrl(surveyResults.spreadsheetUrl)) {
      errors.push('スプレッドシートURLの形式が正しくありません。')
    }
  }

  if (surveyResultsFields.endpointUrl) {
    surveyResults.endpointUrl = (surveyResultsFields.endpointUrl.value || '').trim()
    if (surveyResults.endpointUrl && hasInvalidUrl(surveyResults.endpointUrl)) {
      errors.push('送信先API(URL)の形式が正しくありません。')
    }
  }

  if (surveyResultsFields.apiKey) {
    surveyResults.apiKey = (surveyResultsFields.apiKey.value || '').trim()
  }

  payload.surveyResults = surveyResults

  if (canEditUserDataSettings && payload.userDataSettings) {
    const userDataSettings = { ...payload.userDataSettings }
    if (userDataFields.spreadsheetUrl) {
      userDataSettings.spreadsheetUrl = (userDataFields.spreadsheetUrl.value || '').trim()
      if (userDataSettings.spreadsheetUrl && hasInvalidUrl(userDataSettings.spreadsheetUrl)) {
        errors.push('店舗情報のスプレッドシートURLの形式が正しくありません。')
      }
    }

    if (userDataFields.submitGasUrl) {
      userDataSettings.submitGasUrl = (userDataFields.submitGasUrl.value || '').trim()
      if (userDataSettings.submitGasUrl && hasInvalidUrl(userDataSettings.submitGasUrl)) {
        errors.push('店舗情報保存GASエンドポイントのURL形式が正しくありません。')
      }
    }

    if (userDataFields.readGasUrl) {
      userDataSettings.readGasUrl = (userDataFields.readGasUrl.value || '').trim()
      if (userDataSettings.readGasUrl && hasInvalidUrl(userDataSettings.readGasUrl)) {
        errors.push('店舗情報読み取りGAS URLの形式が正しくありません。')
      }
    }

    payload.userDataSettings = userDataSettings
  } else {
    delete payload.userDataSettings
  }

  if (brandingFields.dataInput || headerImageFields.dataInput) {
    const logoDataUrl = getBrandingValue()
    const headerImageDataUrl = getHeaderImageValue()
    payload.branding = {
      ...payload.branding,
      logoDataUrl,
      headerImageDataUrl,
      faviconDataUrl: logoDataUrl || payload.branding?.faviconDataUrl || '',
    }
  }

  payload.userProfile = getUserProfilePayload()
  if (userProfileFields.admin?.password && userProfileFields.admin?.passwordConfirm) {
    const passwordValue = (userProfileFields.admin.password.value || '').trim()
    const confirmValue = (userProfileFields.admin.passwordConfirm.value || '').trim()
    if (passwordValue !== confirmValue) {
      errors.push('管理者のパスワードと確認が一致しません。')
    }
  }
  surveyFormConfigs.forEach(({ key }) => {
    const manager = surveyFormManagers[key]
    if (!manager) return
    if (manager.isDirty()) {
      payload[key] = manager.toPayload()
    }
  })

  if (errors.length > 0) {
    setStatus(errors.join(' / '), 'error')
    return
  }
  try {
    const response = await fetch('/.netlify/functions/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      const errorMessage =
        errorPayload?.message || '保存に失敗しました。時間を空けて再度お試しください。'
      throw new Error(errorMessage)
    }

    const savedConfig = await response.json().catch(() => null)
    if (savedConfig) {
      loadedConfig = savedConfig
      populateForm(savedConfig)
    } else {
      const fallbackFormConfig = (key) => {
        if (payload[key]) {
          return payload[key]
        }
        if (loadedConfig?.[key]) {
          return JSON.parse(JSON.stringify(loadedConfig[key]))
        }
        return SURVEY_FORM_DEFAULTS[key] || DEFAULT_FORM1
      }
      const fallbackConfig = {
        labels: payload.labels,
        tiers: payload.tiers,
        aiSettings: payload.aiSettings,
        prompts: {
          ...existingPrompts,
          ...payload.prompts,
        },
        branding: payload.branding,
        surveyResults: payload.surveyResults,
        userDataSettings: canEditUserDataSettings
          ? payload.userDataSettings
          : existingUserDataSettings,
        form1: fallbackFormConfig('form1'),
        userProfile: payload.userProfile,
      }
      loadedConfig = fallbackConfig
      populateForm(fallbackConfig)
    }

    const latestUserProfile = loadedConfig?.userProfile || payload.userProfile || {}
    const previousUserId = typeof payload.userProfile?.userId === 'string' ? payload.userProfile.userId : ''
    const currentUserId = typeof latestUserProfile?.userId === 'string' ? latestUserProfile.userId : ''
    const shouldProvisionUserSheet = Boolean(currentUserId && currentUserId !== previousUserId)

    let userProfileSyncResult = { status: 'skipped' }
    if (isUserApp && hasUserDataSyncConfig()) {
      setStatus('店舗情報を保存しています…', 'info', { autoHide: false })
      await waitForStatusPaint()
      userProfileSyncResult = await syncUserProfileExternally(latestUserProfile, {
        shouldCreateUserSheet: shouldProvisionUserSheet,
      })
      if (userProfileSyncResult.status === 'error') {
        setStatus(userProfileSyncResult.message, 'error')
        return
      }
    }

    if (userProfileSyncResult.status === 'success') {
      setStatus('設定と店舗情報を保存しました。', 'success')
    } else {
      setStatus('設定を保存しました。', 'success')
    }

    if (isUserApp) {
      setTimeout(() => {
        window.location.assign('/')
      }, 800)
    }
  } catch (error) {
    console.error(error)
    setStatus(error.message, 'error')
  }
})

loadConfig()

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    loadConfig()
  }
})
