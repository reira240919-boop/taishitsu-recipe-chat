import './style.css'

const GREETING =
  'こんにちは。今いちばん気になる体調を教えてください。体質に合うレシピをご提案します。'

const chatHistory = document.getElementById('chat-history')
const chatForm = document.getElementById('chat-form')
const messageInput = document.getElementById('message-input')
const sendButton = document.getElementById('send-button')
const errorHint = document.getElementById('error-hint')
const quickButtons = document.querySelectorAll('.quick-btn')

let isSending = false

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatHistory.scrollTop = chatHistory.scrollHeight
  })
}

function appendMessage(text, role) {
  const div = document.createElement('div')
  div.className = `message ${role}`
  div.textContent = text
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

const CONVERSATION_STORAGE_KEY = 'difyConversationId'

/**
 * メッセージ送信関数（1か所にまとめてあります）
 * Dify の /api/chat プロキシ（vite.config.js）経由で本物の返答を取得する。
 * @param {string} userMessage - ユーザーが入力したメッセージ
 * @returns {Promise<string>} ボットの返事
 */
async function sendMessage(userMessage) {
  const conversationId = sessionStorage.getItem(CONVERSATION_STORAGE_KEY) || null

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
    sessionStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId)
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

  appendMessage(trimmed, 'user')
  highlightQuickButton(trimmed)
  messageInput.value = ''

  isSending = true
  sendButton.disabled = true
  sendButton.textContent = '送信中…'

  appendTypingIndicator()

  try {
    const reply = await sendMessage(trimmed)
    removeTypingIndicator()
    appendMessage(reply, 'bot')
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

appendMessage(GREETING, 'bot')
