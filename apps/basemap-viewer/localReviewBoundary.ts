import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

export function isLocalReviewPath(value: string) {
  return /(?:^|\/)(?:harbour-app|local-review|__division-review|__address-review)(?:\/|$)/.test(
    value.split('?')[0]!,
  )
}

/** Keep development tools out of every deployable bundle, including accidental imports. */
export function localReviewBoundary(): Plugin {
  return {
    name: 'local-review-build-boundary',
    enforce: 'pre',
    apply: 'build',
    load(id) {
      if (isLocalReviewPath(id.replaceAll('\\', '/')))
        this.error(
          `Local division review files cannot be included in a deployment build: ${id}`,
        )
    },
    generateBundle(_, bundle) {
      for (const [name, output] of Object.entries(bundle)) {
        if (
          isLocalReviewPath(name) ||
          (output.type === 'chunk' &&
            Object.keys(output.modules).some(isLocalReviewPath))
        )
          this.error(`Local division review content leaked into build output: ${name}`)
      }
    },
  }
}

/** Preview servers and non-development modes never serve the editor or its endpoints. */
export function blockLocalReview(): Plugin {
  const block = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      let pathname: string
      try {
        pathname = decodeURIComponent(
          new URL(request.url ?? '/', 'http://localhost').pathname,
        )
      } catch {
        response.statusCode = 400
        response.end('Invalid URL')
        return
      }
      if (isLocalReviewPath(pathname)) {
        response.statusCode = 404
        response.end('Not found')
      } else next()
    })
  }
  return {
    name: 'local-review-unavailable',
    configureServer: block,
    configurePreviewServer: block,
  }
}
