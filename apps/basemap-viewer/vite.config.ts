import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

function localReviewRoutes() {
  const paths = new Set(['/local-review/lantau', '/local-review/fanling'])

  return {
    name: 'local-review-routes',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            request: { url?: string },
            response: {
              end: () => void
              writeHead: (status: number, headers: Record<string, string>) => void
            },
            next: () => void,
          ) => void,
        ) => void
      }
    }) {
      server.middlewares.use((request, response, next) => {
        if (request.url && paths.has(request.url)) {
          response.writeHead(302, { Location: `${request.url}/` })
          response.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [localReviewRoutes(), tailwindcss(), svelte()],
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    allowedHosts: ['basemaps.localhost'],
    hmr: { clientPort: 80 },
  },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node' },
})
