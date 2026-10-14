import { expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { curatedArchiveRows } from './archiveInput'
import { normaliseDivisionRow } from '@repo/core/pipeline/services/divisions/division'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { resolveUploadProcessingStrategy } from '../../commands/uploadProcessing'
const sourceReleases = [
  {
    datasetCode: 'ds-hk-overture-division',
    snapshotId: 'pinned-overture-snapshot',
    releaseCode: 'dr-hk-overture-division-2026-08-19.0',
    sourceVersion: '2026-08-19.0',
    resourceType: 'division',
    rawObjectKey: 'by-source/overture/pinned.zip',
    contentHash: 'a'.repeat(64),
    releaseNotesUrl: '/upstream-notes',
  },
]
const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [114, 22],
      [115, 22],
      [115, 23],
      [114, 22],
    ],
  ],
}
function archive(
  resourceType: 'division' | 'divisionArea',
  rows: any[],
  names?: any[],
) {
  const slug = resourceType === 'division' ? 'division' : 'division-area'
  return zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        schemaVersion: 1,
        datasetCode: 'ds-hk-saanseoi-division',
        releaseCode: `dr-hk-saanseoi-${slug}-2026-09-01.0`,
        resourceType,
        sourceVersion: '2026-09-01.0',
        sourceReleases,
        provenance: {},
      }),
    ),
    'records.json': strToU8(
      JSON.stringify({
        rows: rows.map(row =>
          resourceType === 'division'
            ? {
                ...row,
                names:
                  row.names ??
                  Object.fromEntries(
                    (names ?? [])
                      .filter(name => name.divisionId === row.id)
                      .map(({ divisionId, locale, ...value }) => [locale, value]),
                  ),
              }
            : row,
        ),
      }),
    ),
  })
}
test('curated archive preserves locale rows, ancestry evidence and upstream release identity', () => {
  const hierarchies = {
    full: [
      [{ id: 'parent', name: 'Parent', class: 'district', full_containment: false }],
    ],
  }
  const { rows, manifest } = curatedArchiveRows(
    archive(
      'division',
      [
        { id: 'child', class: 'microhood', hierarchies, geometry: null },
        { id: 'parent', class: 'district', hierarchies: { full: [] }, geometry: null },
      ],
      [
        {
          divisionId: 'child',
          locale: 'zh-hant',
          name: '四小龍',
          meta: { isLocaleInferred: false, fields: { name: { origin: 'provided' } } },
        },
      ],
    ),
  )
  const result = normaliseDivisionRow(rows[0]!, {
    source: { source: 'saanseoi', sourceVersion: manifest.sourceVersion },
  })
  expect(result.base).toMatchObject({
    id: 'child',
    class: 'microhood',
    category: 'hood',
    level: 6,
    hierarchies,
  })
  expect(result.i18n[0]).toMatchObject({
    locale: 'zh-hant',
    name: '四小龍',
    meta: { isLocaleInferred: false },
  })
  expect(manifest.sourceReleases).toEqual(sourceReleases)
})
test('curated area ingestion preserves geometry and identity without upstream remapping', () => {
  const { rows } = curatedArchiveRows(
    archive('divisionArea', [
      {
        id: 'curated-area',
        divisionId: 'child',
        type: 'mixed',
        geometry,
        isLand: true,
        isTerritorial: true,
        identifiers: { saanseoi: { test: 'id' } },
        sources: {
          saanseoi: [{ dataset: 'ds-hk-saanseoi-division', recordId: 'drawing' }],
        },
      },
    ]),
  )
  const result = normaliseDivisionAreaGeometryRow(
    JSON.parse(rows[0]!.record),
    'saanseoi',
    { validateGeometry: true },
  )
  expect(result!.source.properties).toMatchObject({
    isLand: true,
    isTerritorial: true,
    identifiers: { saanseoi: { test: 'id' } },
  })
  expect(result!.canonical).not.toHaveProperty('identifiers')
  expect(result!.canonical).toMatchObject({
    id: 'curated-area',
    divisionId: 'child',
    geometry,
    variant: 'saanseoi',
    type: 'mixed',
    isLand: true,
    isTerritorial: true,
    sources: [
      {
        publisher: 'saanseoi',
        dataset: 'ds-hk-saanseoi-division',
        recordId: 'drawing',
      },
    ],
  })
})
test('duplicate identities are rejected and both resources use ordinary SQL ingestion', () => {
  expect(() =>
    curatedArchiveRows(
      archive('division', [
        { id: 'x', names: {} },
        { id: 'x', names: {} },
      ]),
    ),
  ).toThrow('unique identities')
  for (const resourceType of ['division', 'divisionArea']) {
    expect(
      resolveUploadProcessingStrategy({
        plan: { source: 'saanseoi', theme: 'divisions', resourceType },
      } as never).mode,
    ).toBe(
      resourceType === 'division'
        ? 'local-division-sql'
        : 'local-division-geometry-sql',
    )
  }
})

test('area preparation parses archive JSON fields and preserves false and absent flags', () => {
  for (const stringified of [false, true]) {
    const encode = (value: unknown) => (stringified ? JSON.stringify(value) : value)
    const { rows } = curatedArchiveRows(
      archive('divisionArea', [
        {
          id: 'area',
          divisionId: 'division',
          type: 'land',
          geometry: encode(geometry),
          identifiers: encode({ 'PLAND:TPU': '123' }),
          sources: encode({
            saanseoi: [{ dataset: 'ds-hk-saanseoi-division', recordId: 'drawing' }],
          }),
          isLand: false,
        },
      ]),
    )
    expect(JSON.parse(rows[0]!.record)).toMatchObject({
      id: 'area',
      division_id: 'division',
      class: 'land',
      geometry,
      identifiers: { 'PLAND:TPU': '123' },
      is_land: false,
      is_territorial: null,
      sources: {
        saanseoi: [{ dataset: 'ds-hk-saanseoi-division', recordId: 'drawing' }],
      },
    })
  }
})

test('curated records enter ordinary SQL preparation without adding upstream fixtures', async () => {
  const { buildDivisionSqlState } = await import(
    '../divisions/processLocalDivisionSqlUploadPreparation'
  )
  const { rows } = curatedArchiveRows(
    archive('division', [
      {
        id: 'curated-only',
        class: 'microhood',
        hierarchies: { full: [] },
        geometry: { type: 'Point', coordinates: [114.15, 22.33] },
        names: {
          'zh-hant': {
            name: '四小龍',
            meta: { isLocaleInferred: false },
          },
        },
      },
    ]),
  )
  const state = await buildDivisionSqlState(
    {} as never,
    {
      source: 'saanseoi',
      regionCode: 'hk',
      sourceVersion: '2026-09-01.0',
      cohortKey: '2026-09-01.0',
      releaseCode: 'dr-hk-saanseoi-division-2026-09-01.0',
      datasetCode: 'ds-hk-saanseoi-division',
      resourceType: 'division',
    } as never,
    {} as never,
    new Map(),
    new Map(),
    'curated-snapshot',
    false,
    async () => {},
    [],
    rows,
  )
  expect(state.records).toHaveLength(1)
  expect(state.records[0]!.base).toMatchObject({
    id: 'curated-only',
    class: 'microhood',
    category: 'hood',
    level: 6,
  })
  expect(state.records[0]!.canonicalI18n).toHaveLength(1)
  expect(state.records[0]!.canonicalI18n[0]).toMatchObject({
    locale: 'zh-hant',
    name: '四小龍',
    meta: { isLocaleInferred: false },
  })
})

for (const field of ['isLand', 'isTerritorial']) {
  test(`curated area ingestion rejects non-boolean ${field}`, () => {
    for (const value of [0, 1, 2, 'false', 'true', '0', [], {}]) {
      expect(() =>
        curatedArchiveRows(
          archive('divisionArea', [
            {
              id: 'area',
              divisionId: 'division',
              type: 'land',
              geometry,
              [field]: value,
            },
          ]),
        ),
      ).toThrow(`requires boolean ${field}`)
      expect(() =>
        normaliseDivisionAreaGeometryRow(
          {
            id: 'area',
            division_id: 'division',
            class: 'land',
            geometry,
            source_properties: { [field]: value },
          },
          'saanseoi',
        ),
      ).toThrow(`requires boolean ${field}`)
    }
  })
}

test('archives reject embedded versions and missing input pins before ingestion', () => {
  const row = {
    id: 'id',
    class: 'village',
    hierarchies: { full: [] },
    sources: {
      overture: [
        { dataset: 'ds-hk-overture-division', recordId: 'upstream', release: 'old' },
      ],
    },
  }
  expect(() => curatedArchiveRows(archive('division', [row]))).toThrow(
    'must not contain release',
  )
  expect(() =>
    curatedArchiveRows(
      archive('division', [{ ...row, sources: JSON.stringify(row.sources) }]),
    ),
  ).toThrow('must not contain release')
  expect(() =>
    curatedArchiveRows(
      archive('division', [
        {
          ...row,
          sources: {
            unknown: [{ dataset: 'ds-hk-other-division', recordId: 'upstream' }],
          },
        },
      ]),
    ),
  ).toThrow('Unpinned')
})
