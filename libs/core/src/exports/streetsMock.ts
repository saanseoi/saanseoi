import { createHash } from 'node:crypto'
import baseline from '../../../../fixtures/meta/curations/hkgov-landsd-street-baseline.json'
import divisions from '../../../../fixtures/meta/divisionCodes/geographic.json'
import type { ExportManifest } from './contracts'
import type { ExportHttpContext } from './httpContext'
import { serveExportManifest } from './response'

const aliases: Record<string, string> = {
  'C&W': 'CW',
  E: 'EST',
  IS: 'ILD',
  'K&T': 'KTS',
  KC: 'KLC',
  KT: 'KT',
  N: 'NTH',
  S: 'STH',
  SK: 'SK',
  SSP: 'SSP',
  ST: 'ST',
  TM: 'TM',
  TP: 'TP',
  TW: 'TW',
  WC: 'WC',
  WTS: 'WTS',
  YL: 'YL',
  YTM: 'YTM',
}
const hash = (body: string): string => createHash('sha256').update(body).digest('hex')
export const streetMockRelease = `baseline-${baseline.sourceVersion}-${hash(JSON.stringify(baseline)).slice(0, 16)}`
export const streetMockPrefix = `exports/mock/streets/v0.1/hk/physical/saanseoi/${streetMockRelease}/`
export type StreetMockManifest = Omit<ExportManifest, 'apiReleaseSetId'> & {
  apiReleaseSetId: null
  exportReleaseId: string
  maturity: 'alpha'
  mock: true
  source: {
    release: string
    baselineSha256: string
    scope: string
    attribution: string
  }
}

/** Project persisted canonical identities and translate publisher district abbreviations to geographic codes. */
export function streetMockRows() {
  const codes = new Set(divisions.assignments.map(row => row.divisionCode))
  return baseline.records
    .map(row => ({
      id: row.streetId,
      names: { en: row.names.en, 'zh-Hant': row.names.zhHant, 'zh-Hans': null },
      divisionCodes: [
        ...new Set(
          row.districtCodes.flatMap(code =>
            code
              .toUpperCase()
              .split('-')
              .map(part => {
                const canonical = aliases[part]
                if (!canonical || !codes.has(canonical))
                  throw Error(`Unmapped LandsD district ${part}`)
                return canonical
              }),
          ),
        ),
      ].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Upload the deterministic mock without inventing a published canonical release. */
export async function prepareStreetMock(bucket: R2Bucket): Promise<StreetMockManifest> {
  const rows = streetMockRows()
  if (new Set(rows.map(row => row.id)).size !== rows.length)
    throw Error('Duplicate Street baseline ID')
  const files = []
  for (const format of ['json', 'ndjson'] as const) {
    const body =
      format === 'json'
        ? JSON.stringify(rows)
        : rows.map(row => JSON.stringify(row)).join('\n') + '\n'
    const sha256 = hash(body)
    const key = `${streetMockPrefix}names/00000-${sha256}.${format}`
    const mediaType = format === 'json' ? 'application/json' : 'application/x-ndjson'
    const stored = await bucket.put(key, body, {
      onlyIf: { etagDoesNotMatch: '*' },
      sha256,
      httpMetadata: { contentType: mediaType, cacheControl: 'no-store' },
    })
    if (!stored) {
      const existing = await bucket.get(key)
      if (!existing || hash(await existing.text()) !== sha256)
        throw Error('Street mock immutable conflict')
    }
    files.push({
      key,
      format,
      envelope: format === 'json' ? ('array' as const) : ('records' as const),
      mediaType,
      recordCount: rows.length,
      byteLength: new TextEncoder().encode(body).length,
      sha256,
    })
  }
  const manifest: StreetMockManifest = {
    schemaVersion: 1,
    family: 'streets',
    apiVersion: 'v0.1',
    domain: 'physical',
    variant: 'saanseoi',
    region: 'hk',
    apiReleaseSetId: null,
    exportReleaseId: streetMockRelease,
    maturity: 'alpha',
    mock: true,
    source: {
      release: baseline.sourceVersion,
      baselineSha256: baseline.baselineSha256,
      scope: 'LandsD baseline only; later gazette notice decisions are not applied',
      attribution:
        '© Hong Kong Special Administrative Region Government, Lands Department',
    },
    snapshots: [],
    locales: ['en', 'zh-Hant', 'zh-Hans'],
    crs: 'OGC:CRS84',
    bboxSemantics: 'canonical-saanseoi-area',
    projections: {
      names: { status: 'ready', recordCount: rows.length, files },
      points: { status: 'not_implemented', files: [] },
      geometry: { status: 'not_implemented', files: [] },
    },
  }
  await bucket.put(`${streetMockPrefix}manifest.json`, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  })
  return manifest
}

/** Serve only the explicit temporary baseline until canonical Street release exports exist. */
export async function serveStreetMock(c: ExportHttpContext): Promise<Response> {
  const release = c.req.query('release')
  if (release && release !== streetMockRelease)
    return c.json({ error: 'export_release_not_found' }, 404)
  const object = await c.env.R2_ASSETS.get(`${streetMockPrefix}manifest.json`)
  if (!object) return c.json({ error: 'export_not_ready' }, 503)
  return serveExportManifest(
    c,
    await object.json<StreetMockManifest>(),
    streetMockPrefix,
    streetMockRelease,
  )
}
