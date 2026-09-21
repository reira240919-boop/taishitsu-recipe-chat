import './style.css'

const GREETING =
  'こんにちは。今いちばん気になる体調を教えてください。体質に合うレシピをご提案します。'

const chatHistory = document.getElementById('chat-history')
const chatForm = document.getElementById('chat-form')
const messageInput = document.getElementById('message-input')
const sendButton = document.getElementById('send-button')
const errorHint = document.getElementById('error-hint')
const quickButtons = document.querySelectorAll('.quick-btn')
const resetButton = document.getElementById('reset-button')
const appToast = document.getElementById('app-toast')
const tabChatButton = document.getElementById('tab-chat')
const tabFavoritesButton = document.getElementById('tab-favorites')
const tabMemoButton = document.getElementById('tab-memo')
const chatPanel = document.getElementById('chat-panel')
const favoritesPanel = document.getElementById('favorites-panel')
const memoPanel = document.getElementById('memo-panel')
const memoForm = document.getElementById('memo-form')
const memoDateInput = document.getElementById('memo-date')
const memoTextInput = document.getElementById('memo-text-input')
const memoErrorHint = document.getElementById('memo-error-hint')
const memoList = document.getElementById('memo-list')

let isSending = false

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatHistory.scrollTop = chatHistory.scrollHeight
  })
}

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
const SVG_NS = 'http://www.w3.org/2000/svg'

function createHeartIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '20')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', HEART_PATH)
  svg.appendChild(path)
  return svg
}

function setSaveButtonState(btn, saved) {
  btn.classList.toggle('saved', saved)
  btn.setAttribute('aria-label', saved ? '保存済み' : '保存')
  btn.setAttribute('aria-pressed', String(saved))
  btn.disabled = saved
}

/* --- ボットの返答をMarkdown風に整形して表示する（保存されるのは常に元の生テキスト） --- */

function appendInlineFormatted(parent, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  parts.forEach((part) => {
    if (!part) return
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const strong = document.createElement('strong')
      strong.textContent = part.slice(2, -2)
      parent.appendChild(strong)
    } else {
      parent.appendChild(document.createTextNode(part))
    }
  })
}

function isBulletLine(line) {
  return /^[-・*]\s+/.test(line)
}

function isOrderedLine(line) {
  return /^\d+[.)]\s+/.test(line)
}

function isHeadingLine(line) {
  return /^#{1,3}\s+/.test(line)
}

function stripListPrefix(line) {
  return line.replace(/^[-・*]\s+/, '').replace(/^\d+[.)]\s+/, '')
}

function classifyBlock(raw) {
  const lines = raw.split('\n').filter((l) => l.length > 0)
  if (lines.length === 0) return null

  if (lines.length === 1 && isHeadingLine(lines[0])) {
    return { kind: 'heading', heading: lines[0].replace(/^#{1,3}\s+/, ''), lines: [], raw }
  }
  if (lines.every(isBulletLine)) {
    return { kind: 'ul', heading: null, lines, raw }
  }
  if (lines.every(isOrderedLine)) {
    return { kind: 'ol', heading: null, lines, raw }
  }
  if (lines.length > 1 && !isBulletLine(lines[0]) && !isOrderedLine(lines[0])) {
    const rest = lines.slice(1)
    if (rest.length > 0 && rest.every(isBulletLine)) {
      return { kind: 'heading+ul', heading: lines[0], lines: rest, raw }
    }
    if (rest.length > 0 && rest.every(isOrderedLine)) {
      return { kind: 'heading+ol', heading: lines[0], lines: rest, raw }
    }
  }
  return { kind: 'paragraph', heading: null, lines, raw }
}

function parseBlocks(text) {
  return text
    .split(/\n{2,}/)
    .map((raw) => classifyBlock(raw))
    .filter(Boolean)
}

/**
 * 「材料」の見出しブロック〜「作り方」の見出しブロック（＋直後に続くコツ等）を
 * ひとつのレシピ区間として検出する。直前が短い1行の段落なら、それをタイトル行とみなす。
 */
function findRecipeSection(blocks) {
  const materialsIndex = blocks.findIndex(
    (b) => (b.kind === 'heading+ul' || b.kind === 'ul') && b.heading && /材料/.test(b.heading)
  )
  if (materialsIndex === -1) return null

  const stepsIndex = blocks.findIndex(
    (b, i) =>
      i > materialsIndex &&
      (b.kind === 'heading+ol' || b.kind === 'ol') &&
      b.heading &&
      /作り方|手順/.test(b.heading)
  )
  if (stepsIndex === -1) return null

  let end = stepsIndex
  for (let i = stepsIndex + 1; i < blocks.length; i++) {
    const b = blocks[i]
    if (['heading+ul', 'heading+ol', 'ul', 'ol'].includes(b.kind)) {
      end = i
    } else {
      break
    }
  }

  let start = materialsIndex
  let titleFromBlock = null
  const prev = blocks[materialsIndex - 1]
  if (
    prev &&
    prev.kind === 'paragraph' &&
    prev.lines.length === 1 &&
    prev.lines[0].length <= 40 &&
    !/[。！？?]$/.test(prev.lines[0])
  ) {
    start = materialsIndex - 1
    titleFromBlock = prev.lines[0]
  }

  return { start, end, titleFromBlock }
}

function extractRecipeTitle(text) {
  const quoted = text.match(/[「『]([^」』]{2,40})[」』]/)
  if (quoted) return quoted[1]
  const bold = text.match(/\*\*([^*]{2,40})\*\*/)
  if (bold) return bold[1]
  return null
}

/** 保存(ハート)ボタン用: レシピ部分だけを取り出したプレーンテキストを返す。無ければ null。 */
function extractRecipeText(text) {
  const blocks = parseBlocks(text)
  const section = findRecipeSection(blocks)
  if (!section) return null

  const title = section.titleFromBlock || extractRecipeTitle(text) || 'レシピ'
  const bodyStart = section.titleFromBlock ? section.start + 1 : section.start
  const body = blocks
    .slice(bodyStart, section.end + 1)
    .map((b) => b.raw)
    .join('\n\n')
  return `${title}\n\n${body}`
}

function appendHeading(container, text) {
  const heading = document.createElement('div')
  heading.className = 'message-heading'
  appendInlineFormatted(heading, text)
  container.appendChild(heading)
}

function appendList(container, lines, tag) {
  const list = document.createElement(tag)
  list.className = 'message-list'
  lines.forEach((line) => {
    const li = document.createElement('li')
    appendInlineFormatted(li, stripListPrefix(line))
    list.appendChild(li)
  })
  container.appendChild(list)
}

function appendParagraph(container, lines) {
  const p = document.createElement('p')
  p.className = 'message-paragraph'
  lines.forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'))
    appendInlineFormatted(p, line)
  })
  container.appendChild(p)
}

function renderBlock(container, block) {
  if (block.kind === 'heading') {
    appendHeading(container, block.heading)
  } else if (block.kind === 'ul' || block.kind === 'ol') {
    appendList(container, block.lines, block.kind)
  } else if (block.kind === 'heading+ul') {
    appendHeading(container, block.heading)
    appendList(container, block.lines, 'ul')
  } else if (block.kind === 'heading+ol') {
    appendHeading(container, block.heading)
    appendList(container, block.lines, 'ol')
  } else {
    appendParagraph(container, block.lines)
  }
}

function renderFormattedText(container, text) {
  const blocks = parseBlocks(text)
  const section = findRecipeSection(blocks)

  blocks.forEach((block, i) => {
    if (section && i === section.start) {
      const card = document.createElement('div')
      card.className = 'recipe-card'

      const titleEl = document.createElement('div')
      titleEl.className = 'recipe-card-title'
      titleEl.textContent = section.titleFromBlock || extractRecipeTitle(text) || 'レシピ'
      card.appendChild(titleEl)

      const bodyStart = section.titleFromBlock ? section.start + 1 : section.start
      for (let j = bodyStart; j <= section.end; j++) {
        renderBlock(card, blocks[j])
      }

      container.appendChild(card)
      return
    }
    if (section && i > section.start && i <= section.end) return

    renderBlock(container, block)
  })
}

function appendMessage(text, role, messageId, saveable = true) {
  const div = document.createElement('div')
  div.className = `message ${role}`

  const textEl = document.createElement('div')
  textEl.className = 'message-text'
  if (role === 'bot') {
    renderFormattedText(textEl, text)
  } else {
    textEl.textContent = text
  }
  div.appendChild(textEl)

  if (role === 'bot' && messageId && saveable) {
    const actions = document.createElement('div')
    actions.className = 'message-actions'

    const saveBtn = document.createElement('button')
    saveBtn.type = 'button'
    saveBtn.className = 'save-btn'
    saveBtn.dataset.messageId = messageId
    saveBtn.appendChild(createHeartIcon())
    setSaveButtonState(saveBtn, isFavorited(messageId))
    const saveText = extractRecipeText(text) || text
    saveBtn.addEventListener('click', () => handleSaveClick(saveBtn, messageId, saveText))

    actions.appendChild(saveBtn)
    div.appendChild(actions)
  }

  chatHistory.appendChild(div)
  scrollToBottom()
  return div
}

function appendTypingIndicator() {
  const div = document.createElement('div')
  div.className = 'typing-indicator'
  div.id = 'typing-indicator'
  div.innerHTML = '<span>考え中</span><span class="typing-dots"><span></span><span></span><span></span></span>'
  chatHistory.appendChild(div)
  scrollToBottom()
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator')
  if (el) el.remove()
}

function showErrorHint(show) {
  errorHint.classList.toggle('visible', show)
}

function highlightQuickButton(message) {
  quickButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.message === message)
  })
}

let appToastTimer = null
function showToast(text) {
  appToast.textContent = text
  appToast.classList.add('visible')
  clearTimeout(appToastTimer)
  appToastTimer = setTimeout(() => {
    appToast.classList.remove('visible')
  }, 2200)
}

function generateMessageId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const STORAGE_KEY = 'difyChatState'

let conversationId = null
let messages = []

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversationId, messages }))
  } catch {
    // 保存できなくても会話自体は続けられるようにする
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.messages) || parsed.messages.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function addAndPersist(text, role, saveable = true) {
  const id = generateMessageId()
  appendMessage(text, role, id, saveable)
  messages.push({ id, role, text, saveable })
  saveState()
  return id
}

function startNewConversation() {
  chatHistory.innerHTML = ''
  quickButtons.forEach((btn) => btn.classList.remove('active'))
  showErrorHint(false)
  conversationId = null
  messages = []
  addAndPersist(GREETING, 'bot', false)
}

/* --- お気に入り（会話の記憶とは別の localStorage キーで保存） --- */

const FAVORITES_KEY = 'difyFavoriteRecipes'

let favorites = loadFavorites()

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isFavorited(messageId) {
  return favorites.some((f) => f.id === messageId)
}

function addFavorite(messageId, text) {
  if (isFavorited(messageId)) return { ok: true }
  favorites.unshift({ id: messageId, text, savedAt: new Date().toISOString() })
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
    return { ok: true }
  } catch (err) {
    favorites.shift()
    const reason =
      err && err.name === 'QuotaExceededError'
        ? '保存できませんでした（保存容量がいっぱいです）。'
        : '保存できませんでした（ブラウザの設定で保存がブロックされている可能性があります）。'
    return { ok: false, reason }
  }
}

function removeFavorite(messageId) {
  favorites = favorites.filter((f) => f.id !== messageId)
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  } catch {
    // 削除自体は画面上には反映されるため、そのまま続行する
  }
}

function resetSaveButtonForMessage(messageId) {
  const btn = Array.from(chatHistory.querySelectorAll('.save-btn')).find(
    (b) => b.dataset.messageId === messageId
  )
  if (btn) setSaveButtonState(btn, false)
}

function handleSaveClick(btn, messageId, text) {
  if (isFavorited(messageId)) return
  const result = addFavorite(messageId, text)
  if (result.ok) {
    setSaveButtonState(btn, true)
    showToast('保存しました')
  } else {
    showToast(result.reason)
  }
}

function formatSavedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function renderFavorites() {
  favoritesPanel.innerHTML = ''

  if (favorites.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'favorites-empty'
    empty.textContent = 'まだ保存したレシピがありません。チャットで保存を押すと、ここに残ります。'
    favoritesPanel.appendChild(empty)
    return
  }

  favorites.forEach((fav) => {
    const card = document.createElement('div')
    card.className = 'favorite-card'

    const meta = document.createElement('div')
    meta.className = 'favorite-meta'
    meta.textContent = formatSavedAt(fav.savedAt)
    card.appendChild(meta)

    const text = document.createElement('div')
    text.className = 'favorite-text'

    const heart = createHeartIcon()
    heart.classList.add('favorite-heart')
    heart.setAttribute('aria-hidden', 'true')
    text.appendChild(heart)

    const textBody = document.createElement('div')
    textBody.className = 'favorite-text-body'
    renderFormattedText(textBody, fav.text)
    text.appendChild(textBody)

    card.appendChild(text)

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'favorite-remove-btn'
    removeBtn.textContent = '一覧から消す'
    removeBtn.addEventListener('click', () => {
      const ok = window.confirm('このレシピを一覧から消しますか？')
      if (!ok) return
      removeFavorite(fav.id)
      resetSaveButtonForMessage(fav.id)
      renderFavorites()
      showToast('消しました')
    })
    card.appendChild(removeBtn)

    favoritesPanel.appendChild(card)
  })
}

/* --- 体調メモ（会話の記憶・お気に入りとは別の localStorage キーで保存） --- */

const MEMO_KEY = 'difyConditionMemos'

let memos = loadMemos()

function loadMemos() {
  try {
    const raw = localStorage.getItem(MEMO_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMemos() {
  localStorage.setItem(MEMO_KEY, JSON.stringify(memos))
}

function todayDateString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addMemo(date, text) {
  memos.unshift({ id: generateMessageId(), date, text, savedAt: new Date().toISOString() })
  try {
    saveMemos()
    return { ok: true }
  } catch (err) {
    memos.shift()
    const reason =
      err && err.name === 'QuotaExceededError'
        ? '記録できませんでした（保存容量がいっぱいです）。'
        : '記録できませんでした（ブラウザの設定で保存がブロックされている可能性があります）。'
    return { ok: false, reason }
  }
}

function removeMemo(id) {
  memos = memos.filter((m) => m.id !== id)
  try {
    saveMemos()
  } catch {
    // 削除自体は画面上には反映されるため、そのまま続行する
  }
}

function showMemoErrorHint(show) {
  memoErrorHint.classList.toggle('visible', show)
}

/**
 * 直近の体調メモを Dify への相談文に添える（今日のメモを優先、最大3件）。
 * 画面のユーザー吹き出しには使わず、Difyに送るクエリの組み立てにのみ使う。
 */
function selectRecentMemosForPrompt() {
  const today = todayDateString()
  const todays = memos.filter((m) => m.date === today)
  const others = memos.filter((m) => m.date !== today)
  const selected = todays.slice(0, 3)
  if (selected.length < 3) {
    selected.push(...others.slice(0, 3 - selected.length))
  }
  return selected
}

function buildDifyQuery(userMessage) {
  const selected = selectRecentMemosForPrompt()
  if (selected.length === 0) return userMessage
  const lines = selected.map((m) => `${m.date}: ${m.text}`)
  return `【体調メモ】\n${lines.join('\n')}\n【相談】\n${userMessage}`
}

function renderMemos() {
  memoList.innerHTML = ''

  if (memos.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'memo-empty'
    empty.textContent = 'まだ体調メモがありません。今日の調子を書くと、ここに残ります。'
    memoList.appendChild(empty)
    return
  }

  memos.forEach((memo) => {
    const card = document.createElement('div')
    card.className = 'memo-card'

    const dateEl = document.createElement('div')
    dateEl.className = 'memo-date'
    dateEl.textContent = memo.date
    card.appendChild(dateEl)

    const textEl = document.createElement('div')
    textEl.className = 'memo-text'
    textEl.textContent = memo.text
    card.appendChild(textEl)

    const actions = document.createElement('div')
    actions.className = 'memo-card-actions'

    const consultBtn = document.createElement('button')
    consultBtn.type = 'button'
    consultBtn.className = 'memo-consult-btn'
    consultBtn.textContent = 'これで相談する'
    consultBtn.addEventListener('click', () => {
      showTab('chat')
      handleSend(memo.text)
    })
    actions.appendChild(consultBtn)

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'memo-remove-btn'
    removeBtn.textContent = '消す'
    removeBtn.addEventListener('click', () => {
      const ok = window.confirm('このメモを消しますか？')
      if (!ok) return
      removeMemo(memo.id)
      renderMemos()
      showToast('消しました')
    })
    actions.appendChild(removeBtn)

    card.appendChild(actions)
    memoList.appendChild(card)
  })
}

function showTab(tab) {
  const isFavorites = tab === 'favorites'
  const isMemo = tab === 'memo'
  const isChat = !isFavorites && !isMemo

  chatPanel.style.display = isChat ? 'flex' : 'none'
  favoritesPanel.style.display = isFavorites ? 'flex' : 'none'
  memoPanel.style.display = isMemo ? 'flex' : 'none'

  tabChatButton.classList.toggle('active', isChat)
  tabChatButton.setAttribute('aria-selected', String(isChat))
  tabFavoritesButton.classList.toggle('active', isFavorites)
  tabFavoritesButton.setAttribute('aria-selected', String(isFavorites))
  tabMemoButton.classList.toggle('active', isMemo)
  tabMemoButton.setAttribute('aria-selected', String(isMemo))

  if (isFavorites) renderFavorites()
  if (isMemo) renderMemos()
}

/**
 * メッセージ送信関数（1か所にまとめてあります）
 * Dify の /api/chat プロキシ（vite.config.js / api/chat.js）経由で本物の返答を取得する。
 * @param {string} userMessage - ユーザーが入力したメッセージ
 * @returns {Promise<string>} ボットの返事
 */
async function sendMessage(userMessage) {
  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, conversationId }),
    })
  } catch {
    throw new Error('サーバーに接続できませんでした。もう一度お試しください。')
  }

  let data = {}
  try {
    data = await response.json()
  } catch {
    // レスポンスがJSONでない場合は data を空のまま進める
  }

  if (!response.ok) {
    throw new Error(data.error || 'Difyとの通信でエラーが発生しました。もう一度お試しください。')
  }

  if (data.conversationId) {
    conversationId = data.conversationId
    saveState()
  }

  return data.answer
}

async function handleSend(message) {
  if (isSending) return

  const trimmed = message.trim()
  if (!trimmed) {
    showErrorHint(true)
    messageInput.focus()
    return
  }

  showErrorHint(false)

  addAndPersist(trimmed, 'user')
  highlightQuickButton(trimmed)
  messageInput.value = ''

  isSending = true
  sendButton.disabled = true
  sendButton.textContent = '送信中…'

  appendTypingIndicator()

  try {
    const query = buildDifyQuery(trimmed)
    const reply = await sendMessage(query)
    removeTypingIndicator()
    addAndPersist(reply, 'bot')
  } catch (err) {
    removeTypingIndicator()
    appendMessage(
      err?.message || '申し訳ありません、返信できませんでした。もう一度お試しください。',
      'bot'
    )
  } finally {
    isSending = false
    sendButton.disabled = false
    sendButton.textContent = '送信'
    messageInput.focus()
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault()
  handleSend(messageInput.value)
})

quickButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    handleSend(btn.dataset.message)
  })
})

messageInput.addEventListener('input', () => {
  if (messageInput.value.trim()) showErrorHint(false)
})

resetButton.addEventListener('click', () => {
  if (isSending) return
  const ok = window.confirm(
    'これまでの会話の記録を消して、最初からにしますか？\n（保存されている会話履歴は元に戻せません）'
  )
  if (!ok) return
  startNewConversation()
  showToast('会話を最初からにしました')
})

tabChatButton.addEventListener('click', () => showTab('chat'))
tabFavoritesButton.addEventListener('click', () => showTab('favorites'))
tabMemoButton.addEventListener('click', () => showTab('memo'))

memoDateInput.value = todayDateString()

memoForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const text = memoTextInput.value.trim()
  if (!text) {
    showMemoErrorHint(true)
    memoTextInput.focus()
    return
  }
  showMemoErrorHint(false)
  const date = memoDateInput.value || todayDateString()
  const result = addMemo(date, text)
  if (result.ok) {
    memoTextInput.value = ''
    renderMemos()
    showToast('記録しました')
  } else {
    showToast(result.reason)
  }
})

memoTextInput.addEventListener('input', () => {
  if (memoTextInput.value.trim()) showMemoErrorHint(false)
})

;(function addHeartToFavoritesTab() {
  const icon = createHeartIcon()
  icon.classList.add('tab-heart')
  const label = document.createTextNode(tabFavoritesButton.textContent)
  tabFavoritesButton.textContent = ''
  tabFavoritesButton.appendChild(icon)
  tabFavoritesButton.appendChild(label)
})()

const saved = loadState()
if (saved) {
  conversationId = saved.conversationId || null
  let needsResave = false
  saved.messages.forEach((m) => {
    if (m && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string') {
      const id = m.id || generateMessageId()
      if (!m.id) needsResave = true
      let saveable = m.saveable
      if (typeof saveable !== 'boolean') {
        saveable = !(m.role === 'bot' && m.text === GREETING)
        needsResave = true
      }
      appendMessage(m.text, m.role, id, saveable)
      messages.push({ id, role: m.role, text: m.text, saveable })
    }
  })
  if (messages.length === 0) {
    addAndPersist(GREETING, 'bot', false)
  } else if (needsResave) {
    saveState()
  }
} else {
  addAndPersist(GREETING, 'bot', false)
}
