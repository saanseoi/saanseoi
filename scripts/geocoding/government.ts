/** Direct government baselines. Never enrich reverse results with ALS. */
export function alsUrl(address: string): URL {
  const url = new URL('https://www.als.gov.hk/lookup')
  url.search = new URLSearchParams({
    q: address,
    t: '60',
    n: '1',
    '3d': '0',
  }).toString()
  return url
}

export function reverseUrl(longitude: number, latitude: number, key: string): URL {
  if (!key) throw new Error('HK_MAP_SERVICE_KEY is required')
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 85.05112878
  ) {
    throw new Error('Invalid Web Mercator coordinates')
  }
  const url = new URL(
    'https://api.hkmapservice.gov.hk/ags/gc/loc/address/reverseGeocode',
  )
  url.search = new URLSearchParams({
    key,
    outSR: JSON.stringify({ wkid: 3857 }),
    location: JSON.stringify({
      x: ((longitude * Math.PI) / 180) * 6378137,
      y: Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) * 6378137,
      spatialReference: { wkid: 102100, latestWkid: 3857 },
    }),
    distance: '500',
    f: 'json',
  }).toString()
  return url
}

export async function requestGovernment(
  url: URL,
  provider: 'als' | 'hk-map-service',
  fetcher: (url: URL, init?: RequestInit) => Promise<Response> = fetch,
) {
  const safe = new URL(url)
  const key = safe.searchParams.get('key')
  safe.searchParams.delete('key')
  const started = performance.now()
  const base = { provider, url: safe.toString() }
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7',
      },
    })
    let body: Record<string, unknown> | null = null
    try {
      let raw = await response.text()
      if (key)
        raw = raw
          .replaceAll(key, '[REDACTED]')
          .replaceAll(encodeURIComponent(key), '[REDACTED]')
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        body = parsed as Record<string, unknown>
    } catch {
      /* Malformed responses are recorded as errors, never no-match. */
    }
    const matches =
      provider === 'als'
        ? Array.isArray(body?.SuggestedAddress) && body.SuggestedAddress.length > 0
        : Boolean(body?.address)
    const valid =
      provider === 'als'
        ? Array.isArray(body?.SuggestedAddress)
        : Boolean(body?.address)
    return {
      ...base,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      body,
      outcome:
        !response.ok || !body || body.error || !valid
          ? 'error'
          : matches
            ? 'results'
            : 'no_match',
    }
  } catch {
    // Exception messages can contain request URLs and credentials.
    return {
      ...base,
      status: null,
      durationMs: Math.round(performance.now() - started),
      body: null,
      outcome: 'error',
    }
  }
}
