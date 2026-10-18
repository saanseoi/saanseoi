// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// - REQUEST CONTRACT
// - RouteRequest
// - authorized
// - readJson
// - isRecord
// - isCosting
// - isLocation
// - parseRoute
// - json
// ---

// RUNTIME
import { timingSafeEqual } from 'node:crypto'

type Location = { lat: number; lon: number }
export type RouteRequest = {
  locations: Location[]
  costing: 'pedestrian' | 'bicycle' | 'auto' | 'motor_scooter'
  directions_options: { units: 'kilometers'; language: 'en-US' }
}

/**
 * Compares hashed credentials without logging or disclosing their lengths.
 * @param request - Internal service-binding request.
 * @param secret - Environment-specific routing credential.
 * @returns Whether this caller can start the engine.
 */
export async function authorized(request: Request, secret: string): Promise<boolean> {
  if (!secret) return false
  const encoder = new TextEncoder()
  const [supplied, expected] = await Promise.all([
    crypto.subtle.digest(
      'SHA-256',
      encoder.encode(request.headers.get('authorization') ?? ''),
    ),
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${secret}`)),
  ])
  return timingSafeEqual(new Uint8Array(supplied), new Uint8Array(expected))
}

/**
 * Reads JSON within a fixed memory budget and cancels oversized bodies.
 * @param body - Request or native response stream.
 * @param maximum - Maximum accepted bytes.
 * @returns Untrusted parsed JSON for the caller to narrow.
 */
export async function readJson(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
): Promise<unknown> {
  if (!body) throw new Error('JSON body required')
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maximum) throw new Error('JSON body too large')
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally {
    await reader.cancel()
  }
}

/** Narrows JSON object records. @param value - Untrusted JSON. @returns Whether this is an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrows supported street profiles. @param value - Untrusted costing. @returns Whether this profile is supported. */
function isCosting(value: unknown): value is RouteRequest['costing'] {
  return (
    value === 'pedestrian' ||
    value === 'bicycle' ||
    value === 'auto' ||
    value === 'motor_scooter'
  )
}

/** Narrows covered points. @param value - Untrusted location. @returns Whether the point is in the supported GBA extent. */
function isLocation(value: unknown): value is Location {
  return (
    isRecord(value) &&
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lon === 'number' &&
    Number.isFinite(value.lon) &&
    value.lat >= 20 &&
    value.lat <= 25 &&
    value.lon >= 110 &&
    value.lon <= 117
  )
}

/**
 * Accepts only two GBA endpoints and a supported street profile.
 * @param request - Internal routing request with a maximum 4 KiB JSON body.
 * @returns Native options with standard snapping and access defaults.
 * @remarks Transit, arbitrary native options and benchmark snapping overrides are excluded.
 */
export async function parseRoute(request: Request): Promise<RouteRequest> {
  const value = await readJson(request.body, 4096)
  if (
    !isRecord(value) ||
    !isCosting(value.costing) ||
    !Array.isArray(value.locations) ||
    value.locations.length !== 2 ||
    !value.locations.every(isLocation)
  )
    throw new Error('Invalid street route request')
  return {
    locations: value.locations.map(({ lat, lon }) => ({ lat, lon })),
    costing: value.costing,
    directions_options: { units: 'kilometers', language: 'en-US' },
  }
}

/**
 * Prevents route data from entering HTTP caches.
 * @param value - Result or safe error.
 * @param status - HTTP status.
 * @returns Uncached JSON response.
 */
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}
