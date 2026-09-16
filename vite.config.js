import { defineConfig, loadEnv } from 'vite'
import { callDify } from './api/_dify.js'

/**
 * Dify の /chat-messages を代わりに呼ぶ dev server 用プロキシ。
 * APIキーはここ（Node側）でしか使わないので、ブラウザ側のJSには渡らない。
 * 本番（Vercel）では api/chat.js が同じロジック（./api/_dify.js）を使う。
 */
function difyProxyPlugin(env) {
  const apiKey = env.DIFY_API_KEY || ''
  const apiBase = (env.DIFY_API_BASE || 'https://api.dify.ai/v1').replace(/\/$/, '')

  return {
    name: 'dify-chat-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        if (!apiKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'サーバー側でDifyのAPIキーが設定されていません。' }))
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', async () => {
          try {
            const { message, conversationId } = JSON.parse(body || '{}')
            if (!message || !String(message).trim()) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'メッセージが空です。' }))
              return
            }

            const result = await callDify({
              query: String(message).trim(),
              conversationId: conversationId || null,
              apiKey,
              apiBase,
            })
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err) {
            console.error('[dify-proxy]', err)
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({ error: 'Difyとの通信でエラーが発生しました。もう一度お試しください。' })
            )
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [difyProxyPlugin(env)],
  }
})
