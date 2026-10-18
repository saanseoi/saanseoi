// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// - CONTAINER LIFECYCLE
// - NativeRouting.warmup
// - NativeRouting.calculate
// - NativeRouting.onActivityExpired
// - PRIVATE SERVICE
// - fetch
// ---

// THIRD PARTY
import { Container, getContainer } from '@cloudflare/containers'
// ROUTING
import release from './graph-release.json'
import { authorized, json, parseRoute, readJson } from './request'
// TYPES
import type { RouteRequest } from './request'

/** One on-demand GBA engine per deployment, isolated from preview and benchmarks. */
export class NativeRouting extends Container<Env> {
  defaultPort = 8002
  sleepAfter = '2m'
  enableInternet = false
  private activeRoutes = 0

  /**
   * Starts routing while the user chooses their destination/options.
   * @returns Readiness and the idle timeout in seconds.
   */
  async warmup(): Promise<{ ready: true; idleTimeoutSeconds: number }> {
    await this.startAndWaitForPorts()
    this.renewActivityTimeout()
    return { ready: true, idleTimeoutSeconds: 120 }
  }

  /**
   * Bounds simultaneous native routes and keeps their response parsing within the slot.
   * @param input - Validated street route, with no arbitrary engine options.
   * @returns Native journey envelope or safe engine/overload feedback.
   * @remarks The eight-request bound is an initial operational limit, not a capacity claim.
   */
  async calculate(input: RouteRequest): Promise<Response> {
    if (this.activeRoutes >= 8) {
      const response = json({ error: 'Routing is busy. Please try again.' }, 503)
      response.headers.set('Retry-After', '2')
      return response
    }
    ++this.activeRoutes
    try {
      const response = await this.fetch(
        new Request('http://container/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      )
      const native = await readJson(response.body, 8 * 1024 * 1024)
      this.renewActivityTimeout()
      return json(
        {
          native,
          dataset: { release: release.release, graphSha256: release.graphSha256 },
        },
        response.status,
      )
    } finally {
      --this.activeRoutes
    }
  }

  /**
   * Stops idle compute while preserving active route processing.
   * @returns Completion after expiry has been deferred or the engine has stopped.
   */
  override async onActivityExpired(): Promise<void> {
    if (this.activeRoutes > 0) this.renewActivityTimeout()
    else await this.destroy()
  }
}

export default {
  /**
   * Exposes only private route, intent warm-up and passive release-health operations.
   * @param request - Service-binding request carrying the environment-specific token.
   * @param env - Generated bindings; no public HTTP route is configured.
   * @returns Safe uncached results; no benchmark stop/state controls are exposed.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = request.headers.get('X-Routing-Client') ?? ''
    let clients: Record<string, string>
    try {
      clients = JSON.parse(env.ROUTING_CLIENTS)
    } catch {
      return json({ error: 'Routing credentials are not configured' }, 503)
    }
    const token = Object.hasOwn(clients, client) ? clients[client] : undefined
    if (typeof token !== 'string' || !(await authorized(request, token)))
      return json({ error: 'Unauthorized' }, 401)
    if (!(await env.CLIENT_LIMITER.limit({ key: client })).success)
      return json({ error: 'Application routing rate limit exceeded' }, 429)
    const path = new URL(request.url).pathname
    if (request.method === 'GET' && path === '/health')
      return json({
        service: 'routing',
        release: release.release,
        graphSha256: release.graphSha256,
        idleTimeoutSeconds: 120,
        limitations: release.limitations,
      })
    if (request.method !== 'POST' || (path !== '/warmup' && path !== '/route'))
      return json({ error: 'Unknown routing operation' }, 404)
    let input: RouteRequest | undefined
    if (path === '/route') {
      try {
        input = await parseRoute(request)
      } catch {
        return json({ error: 'Invalid street route request' }, 400)
      }
    }
    const started = Date.now()
    let response: Response
    try {
      const container = getContainer(env.NATIVE, 'gba-routing')
      response = input
        ? await container.calculate(input)
        : json(await container.warmup())
    } catch {
      response = json(
        { error: 'Routing is temporarily unavailable. Please try again.' },
        503,
      )
    }
    // Operational telemetry deliberately excludes coordinates, instructions and raw exceptions.
    console.log(
      JSON.stringify({
        event: 'routing_request',
        client,
        operation: path.slice(1),
        status: response.status,
        mode: input?.costing,
        elapsedMs: Date.now() - started,
        graphRelease: release.release,
        colo: request.cf?.colo,
      }),
    )
    return response
  },
} satisfies ExportedHandler<Env>
