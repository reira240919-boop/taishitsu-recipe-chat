/**
 * Dify の /chat-messages を呼ぶ共通ロジック。
 * dev用プロキシ（vite.config.js）と本番用（api/chat.js, Vercel Functions）の両方から使う。
 */
export async function callDify({ query, conversationId, apiKey, apiBase }) {
  const payload = {
    inputs: {},
    query,
    response_mode: 'blocking',
    user: 'web-user',
  }
  if (conversationId) payload.conversation_id = conversationId

  const res = await fetch(`${apiBase}/chat-messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  // 会話IDがDify側で見つからないときは、新規会話としてやり直す
  if (res.status === 404 && conversationId) {
    return callDify({ query, conversationId: null, apiKey, apiBase })
  }

  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Dify API error ${res.status}: ${text.slice(0, 500)}`)
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const answer =
    (data.answer || '').trim() || 'うまく答えを作れませんでした。もう一度質問してみてください。'
  return { answer, conversationId: data.conversation_id }
}
