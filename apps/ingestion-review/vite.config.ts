import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    {
      name: 'local-ingestion-review',
      configureServer(server) {
        server.middlewares.use('/api/review', (req, res) => {
          // Accept local browser requests only; the service is intentionally read-only.
          const origin = req.headers.origin
          if (
            req.method !== 'GET' ||
            (origin && new URL(origin).host !== req.headers.host)
          ) {
            res.writeHead(403).end('Local GET requests only')
            return
          }
          const worker = new Worker(new URL('./worker.ts', import.meta.url).href)
          const timer = setTimeout(() => {
            worker.terminate()
            res.writeHead(504).end(
              JSON.stringify({
                error: 'Query exceeded 120 seconds. Select a smaller group.',
              }),
            )
          }, 120_000)
          res.on('close', () => {
            clearTimeout(timer)
            worker.terminate()
          })
          worker.onmessage = event => {
            clearTimeout(timer)
            res.writeHead(event.data.status, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(event.data.body))
            worker.terminate()
          }
          worker.onerror = event => {
            clearTimeout(timer)
            res.writeHead(500).end(JSON.stringify({ error: event.message }))
            worker.terminate()
          }
          worker.postMessage(req.url)
        })
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: '#lib/bits/internal/i18n.js',
        replacement: resolve(import.meta.dirname, '../../libs/i18n/src/messages.ts'),
      },
      {
        find: '#lib',
        replacement: resolve(import.meta.dirname, '../atlas-app/src/lib'),
      },
    ],
  },
  server: { fs: { allow: [resolve(import.meta.dirname, '../..')] } },
})
