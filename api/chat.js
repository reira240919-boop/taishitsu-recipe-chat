import { callDify } from './_dify.js'

/**
 * 本番用（Vercel Functions）の /api/chat エンドポイント。
 * APIキーはVercelの環境変数（DIFY_API_KEY / DIFY_API_BASE）から読む。
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const apiKey = process.env.DIFY_API_KEY || ''
  const apiBase = (process.env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '')

  if (!apiKey) {
    res.status(500).json({ error: 'サーバー側でDifyのAPIキーが設定されていません。' })
    return
  }

  const { message, conversationId } = req.body || {}
  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'メッセージが空です。' })
    return
  }

  try {
    const result = await callDify({
      query: String(message).trim(),
      conversationId: conversationId || null,
      apiKey,
      apiBase,
    })
    res.status(200).json(result)
  } catch (err) {
    console.error('[dify-proxy]', err)
    res.status(502).json({ error: 'Difyとの通信でエラーが発生しました。もう一度お試しください。' })
  }
}
