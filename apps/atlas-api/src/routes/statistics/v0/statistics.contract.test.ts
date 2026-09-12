import { describe, expect, test } from 'bun:test'
import app from '../../../index'
import {
  fixtureEnv,
  run,
  DATASET_CODE,
  HISTORICAL_DATASET_CODE,
  STATISTIC_ID,
  RELEASE_ID,
} from './statisticsFixtures'

type StatisticsListDocument = {
  data: unknown[]
  links: { permalink: string }
  meta: Record<string, unknown>
}

describe('Statistics API responses through the Worker route', () => {
  test('list and detail include dimension definitions by default and support include=none', async () => {
    const fixture = fixtureEnv()
    try {
      for (const path of ['/stats/v0.1', `/stats/v0.1/${STATISTIC_ID}`]) {
        for (const include of [undefined, 'fields', 'none']) {
          const response = await app.fetch(
            new Request(
              `http://localhost${path}${include ? `?include=${include}` : ''}`,
            ),
            fixture.env,
          )
          expect(response.status).toBe(200)
          const document = (await response.json()) as {
            included?: Array<{ type: string; id: string; attributes: unknown }>
            links: { permalink: string }
          }
          expect(new URL(document.links.permalink).searchParams.get('include')).toBe(
            include ?? 'fields',
          )
          if (include === 'none') {
            expect(document.included ?? []).toEqual([])
          } else {
            expect(document.included).toHaveLength(1)
            expect(document.included).toMatchObject([
              {
                type: 'statistic-fields',
                id: `${DATASET_CODE}:totalPopulation:field-version-hash`,
                attributes: {
                  fieldName: 'totalPopulation',
                  versionHash: 'field-version-hash',
                  dimensions: { sex: 'all' },
                  unitCode: 'person',
                },
              },
            ])
          }
        }
      }
    } finally {
      fixture.close()
    }
  })

  test('serves current for latest selectors and older periods without querying history', async () => {
    const fixture = fixtureEnv()
    try {
      run(
        fixture.current,
        `UPDATE statsRecords SET "values" = '{"totalPopulation":"240000","femalePopulation":"120000"}' WHERE id = ?`,
        [STATISTIC_ID],
      )
      const unavailableHistory = {
        prepare() {
          throw new Error('Current request queried history')
        },
      } as unknown as D1Database
      const env = {
        ...fixture.env,
        DB_HISTORY_HK_BEFORE: unavailableHistory,
        DB_HISTORY_HK_2025: unavailableHistory,
        DB_HISTORY_HK_2026: unavailableHistory,
      }
      for (const query of [
        '',
        '?releaseSet=data-hk-stats-2021',
        '?catalogRevision=catalog-hk-stats-v0.1-2026-08-20-r0',
        '?effectiveAt=2026-08-20T00:00:00.000Z',
      ]) {
        const response = await app.fetch(
          new Request(`http://localhost/stats/v0.1${query}`),
          env,
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
          data: [
            {
              id: STATISTIC_ID,
              attributes: {
                values: { totalPopulation: '240000', femalePopulation: '120000' },
              },
            },
          ],
          meta: { page: { total: 1 } },
        })
      }
      for (const path of [
        `/stats/v0.1?filter[referencePeriod]=2020&filter[dataset]=${DATASET_CODE}`,
        '/stats/v0.1/registry/fields',
        '/stats/v0.1/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2020',
        '/stats/v0.1/series?filter[field]=totalPopulation',
        `/stats/v0.1/${STATISTIC_ID}`,
      ]) {
        const response = await app.fetch(new Request(`http://localhost${path}`), env)
        expect(response.status).toBe(200)
      }
    } finally {
      fixture.close()
    }
  })

  test('fails closed while current publication is incomplete', async () => {
    const fixture = fixtureEnv()
    try {
      run(
        fixture.current,
        `UPDATE statsPublicationState SET status = 'publishing' WHERE referencePeriodCode = '2021'`,
      )
      for (const path of [
        '/stats/v0.1',
        `/stats/v0.1/${STATISTIC_ID}`,
        '/stats/v0.1/registry/fields',
        '/stats/v0.1/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2021',
        '/stats/v0.1/series?filter[field]=totalPopulation',
      ]) {
        const response = await app.fetch(
          new Request(`http://localhost${path}`),
          fixture.env,
        )
        expect(response.status).toBe(503)
      }
    } finally {
      fixture.close()
    }
  })

  test('reads exact old revisions from sparse history while current serves the corrected pack', async () => {
    const fixture = fixtureEnv()
    try {
      const newerAt = '2026-08-21T00:00:00.000Z'
      run(
        fixture.meta,
        `INSERT INTO snapshots (id, resourceType, code, cohortKey, revision, status, publishedAt, validFrom, parentSnapshotId, createdAt, updatedAt)
        SELECT 'snapshot-statistics-revised', resourceType, code || '-r1', cohortKey, 1, status, ?, ?, id, ?, ? FROM snapshots WHERE id = 'snapshot-statistics'`,
        [newerAt, newerAt, newerAt, newerAt],
      )
      run(
        fixture.meta,
        `INSERT INTO snapshotSources (snapshotId, datasetId, resourceReleaseId, role, createdAt)
        SELECT 'snapshot-statistics-revised', datasetId, resourceReleaseId, role, ? FROM snapshotSources WHERE snapshotId = 'snapshot-statistics'`,
        [newerAt],
      )
      run(
        fixture.meta,
        `INSERT INTO apiReleaseSets (id, apiVersionId, code, regionCode, domainCode, cohortKey, revision, effectiveFrom, schemaVersion, rulesetVersion, status, publishedAt, versionHash, createdAt, updatedAt)
        SELECT 'release-set-statistics-revised', apiVersionId, code || '-r1', regionCode, domainCode, cohortKey, 1, effectiveFrom, schemaVersion, rulesetVersion, status, ?, 'revised-release-hash', ?, ? FROM apiReleaseSets WHERE id = 'release-set-statistics'`,
        [newerAt, newerAt, newerAt],
      )
      run(
        fixture.meta,
        `INSERT INTO apiReleaseSetSnapshots (apiReleaseSetId, snapshotId, variant, role, isRequired, cohortMatchingMode, createdAt)
        SELECT 'release-set-statistics-revised', 'snapshot-statistics-revised', variant, role, isRequired, cohortMatchingMode, ? FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = 'release-set-statistics'`,
        [newerAt],
      )
      run(
        fixture.meta,
        `INSERT INTO apiCatalogRevisions (id, apiVersionId, code, regionCode, publicationDate, revision, defaultDomainCode, status, publishedAt, versionHash, createdAt, updatedAt)
        SELECT 'catalog-statistics-revised', apiVersionId, 'catalog-hk-stats-v0.1-2026-08-21-r0', regionCode, '2026-08-21', 0, defaultDomainCode, status, ?, 'revised-catalog-hash', ?, ? FROM apiCatalogRevisions WHERE id = 'catalog-statistics'`,
        [newerAt, newerAt, newerAt],
      )
      run(
        fixture.meta,
        `INSERT INTO apiCatalogRevisionReleaseSets (apiCatalogRevisionId, apiReleaseSetId, domainCode, cohortKey, isDefault, createdAt)
        SELECT 'catalog-statistics-revised', CASE WHEN apiReleaseSetId = 'release-set-statistics' THEN 'release-set-statistics-revised' ELSE apiReleaseSetId END, domainCode, cohortKey, isDefault, ? FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId = 'catalog-statistics'`,
        [newerAt],
      )
      run(
        fixture.current,
        `UPDATE statsRecords SET "values" = '{"totalPopulation":"250000"}', fieldDefinitionHashes = '{"totalPopulation":"revised-field-hash"}', versionHash = 'revised-pack-hash' WHERE id = ?`,
        [STATISTIC_ID],
      )
      run(
        fixture.current,
        `INSERT INTO statsFields (datasetCode, fieldName, versionHash, measureCode, sourceField, dimensions, statisticKind, aggregation, valueKind, unitCode, createdAt, updatedAt)
        SELECT datasetCode, fieldName, 'revised-field-hash', measureCode, sourceField, '{"sex":"all","residency":"usual"}', statisticKind, aggregation, valueKind, unitCode, createdAt, updatedAt
        FROM statsFields WHERE datasetCode = ? AND fieldName = 'totalPopulation' AND versionHash = 'field-version-hash'`,
        [DATASET_CODE],
      )
      run(
        fixture.current,
        `UPDATE statsPublicationState SET snapshotId = 'snapshot-statistics-revised' WHERE referencePeriodCode = '2021'`,
      )
      for (const [query, expected] of [
        ['', '250000'],
        ['?catalogRevision=catalog-hk-stats-v0.1-2026-08-20-r0', '235953'],
        ['?knownAt=2026-08-20T00:00:00.000Z', '235953'],
        ['?releaseSet=data-hk-stats-2021', '235953'],
        ['?releaseSet=data-hk-stats-2021-r1', '250000'],
      ] as const) {
        const response = await app.fetch(
          new Request(`http://localhost/stats/v0.1/${STATISTIC_ID}${query}`),
          fixture.env,
        )
        expect(response.status).toBe(200)
        const document = (await response.json()) as {
          data: { links: { self: string } }
        }
        const historical = expected === '235953'
        const expectedDefinition = {
          type: 'statistic-fields',
          id: `${DATASET_CODE}:totalPopulation:${historical ? 'field-version-hash' : 'revised-field-hash'}`,
          attributes: {
            dimensions: historical
              ? { sex: 'all' }
              : { sex: 'all', residency: 'usual' },
          },
        }
        expect(document).toMatchObject({
          data: {
            id: STATISTIC_ID,
            attributes: { values: { totalPopulation: expected } },
          },
          included: [expectedDefinition],
        })
        const list = await app.fetch(
          new Request(`http://localhost/stats/v0.1${query}`),
          fixture.env,
        )
        expect(list.status).toBe(200)
        expect(await list.json()).toMatchObject({ included: [expectedDefinition] })
        const self = await app.fetch(new Request(document.data.links.self), fixture.env)
        expect(self.status).toBe(200)
        expect(await self.json()).toMatchObject({
          data: { attributes: { values: { totalPopulation: expected } } },
        })
      }
      const map = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2021&catalogRevision=catalog-hk-stats-v0.1-2026-08-20-r0',
        ),
        fixture.env,
      )
      expect(map.status).toBe(200)
      expect(await map.json()).toMatchObject({ values: { CW: '235953' } })
      const registry = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields/${DATASET_CODE}/totalPopulation?releaseSet=data-hk-stats-2021&filter[version]=field-version-hash`,
        ),
        fixture.env,
      )
      expect(registry.status).toBe(200)
      const registryDocument = (await registry.json()) as {
        data: { links: { self: string } }
      }
      const registrySelfUrl = new URL(
        registryDocument.data.links.self,
        'http://localhost',
      )
      expect(registrySelfUrl.searchParams.get('catalogRevision')).toBe(
        'catalog-hk-stats-v0.1-2026-08-20-r0',
      )
      const registrySelf = await app.fetch(new Request(registrySelfUrl), fixture.env)
      expect(registrySelf.status).toBe(200)
    } finally {
      fixture.close()
    }
  })

  test('HK is the default and GBA selects the same Statistics publication', async () => {
    const fixture = fixtureEnv()
    try {
      for (const path of ['/stats/v0.1', '/stats/v0.1/registry/fields']) {
        const records = []
        for (const region of ['', 'hk', 'gba']) {
          const response = await app.fetch(
            new Request(`http://localhost${path}${region ? `?region=${region}` : ''}`),
            fixture.env,
          )
          expect(response.status).toBe(200)
          records.push(((await response.json()) as { data: unknown }).data)
        }
        expect(records[1]).toEqual(records[0])
        expect(records[2]).toEqual(records[0])
      }
    } finally {
      fixture.close()
    }
  })

  test('list, filters, profiles, detail, and product version', async () => {
    const fixture = fixtureEnv()
    try {
      const list = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1?profile=full&filter[field]=totalPopulation&page[limit]=10',
        ),
        fixture.env,
      )
      const listBody = (await list.json()) as StatisticsListDocument
      expect(list.status).toBe(200)
      expect(listBody.data).toHaveLength(1)
      expect(listBody.data[0]).toMatchObject({
        type: 'statistics',
        id: STATISTIC_ID,
        attributes: {
          referencePeriod: {
            code: '2021',
            endYear: '2021',
            granularity: 'year',
          },
          sourceReleaseId: RELEASE_ID,
          values: {
            totalPopulation: '235953',
          },
        },
      })
      expect(listBody.meta).toMatchObject({
        requestedApiFamily: 'stats',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-stats-v0.1',
        apiReleaseSet: 'data-hk-stats-2021',
        page: { limit: 10, offset: 0, total: 1 },
      })
      expect(listBody.links.permalink).toContain('/stats/v0.1?')

      const crossPeriod = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1?cohort=2021&filter[referencePeriod]=2020',
        ),
        fixture.env,
      )
      const crossPeriodBody = (await crossPeriod.json()) as StatisticsListDocument
      expect(crossPeriod.status).toBe(200)
      expect(crossPeriodBody.data).toEqual([])

      const detail = await app.fetch(
        new Request(`http://localhost/stats/v0.1/${STATISTIC_ID}`),
        fixture.env,
      )
      expect(detail.status).toBe(200)
      expect(await detail.json()).toMatchObject({
        data: { id: STATISTIC_ID, type: 'statistics' },
      })

      const fields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/${STATISTIC_ID}?include=fields&locales=en,zh-hant,zh-hans`,
        ),
        fixture.env,
      )
      expect(fields.status).toBe(200)
      expect(await fields.json()).toMatchObject({
        data: { id: STATISTIC_ID, type: 'statistics' },
        included: [
          {
            type: 'statistic-fields',
            id: `${DATASET_CODE}:totalPopulation:field-version-hash`,
            attributes: {
              fieldName: 'totalPopulation',
              i18n: {
                en: { name: 'Total population', description: 'Number of people.' },
                'zh-hant': { name: '總人口', description: '人口數目。' },
                'zh-hans': { name: '总人口', description: '人口数目。' },
              },
            },
          },
        ],
      })

      const registry = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry'),
        fixture.env,
      )
      expect(registry.status).toBe(200)
      const registryBody = (await registry.json()) as {
        data: { id: string; type: string; attributes: Record<string, unknown> }
        meta: Record<string, unknown>
      }
      expect(registryBody).toMatchObject({
        data: {
          type: 'statistic-registry',
          id: 'catalog-hk-stats-v0.1-2026-08-20-r0',
          attributes: { datasets: 2, fields: 2, measures: 2 },
        },
        meta: {
          apiReleaseSets: ['data-hk-stats-2021', 'data-hk-stats-2020'],
          cohorts: ['2021', '2020'],
        },
      })
      expect(registryBody.meta.apiReleaseSet).toBeUndefined()

      const historicalRegistryFields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields?filter[dataset]=${HISTORICAL_DATASET_CODE}`,
        ),
        fixture.env,
      )
      expect(historicalRegistryFields.status).toBe(200)
      expect(await historicalRegistryFields.json()).toMatchObject({
        data: [
          {
            type: 'statistic-fields',
            attributes: {
              datasetCode: HISTORICAL_DATASET_CODE,
              fieldName: 'households',
            },
          },
        ],
      })

      const cohortRegistryFields = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields?cohort=2021&filter[dataset]=${HISTORICAL_DATASET_CODE}`,
        ),
        fixture.env,
      )
      expect(cohortRegistryFields.status).toBe(200)
      expect(await cohortRegistryFields.json()).toMatchObject({ data: [] })

      const registryFields = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1/registry/fields?filter[measure]=totalPopulation&filter[dimension]=sex:all',
        ),
        fixture.env,
      )
      expect(registryFields.status).toBe(200)
      expect(await registryFields.json()).toMatchObject({
        data: [
          {
            type: 'statistic-fields',
            attributes: {
              datasetCode: DATASET_CODE,
              fieldName: 'totalPopulation',
              measureCode: 'totalPopulation',
            },
          },
        ],
      })

      for (const version of ['v0', 'v0.1']) {
        const registryMeasure = await app.fetch(
          new Request(
            `http://localhost/stats/${version}/registry/measures/${DATASET_CODE}/totalPopulation`,
          ),
          fixture.env,
        )
        expect(registryMeasure.status).toBe(200)
        expect(await registryMeasure.json()).toMatchObject({
          data: {
            type: 'statistic-measures',
            attributes: {
              datasetCode: DATASET_CODE,
              measureCode: 'totalPopulation',
            },
            links: {
              self: `/stats/v0.1/registry/measures/${DATASET_CODE}/totalPopulation?filter[version]=measure-version-hash&catalogRevision=catalog-hk-stats-v0.1-2026-08-20-r0`,
            },
          },
        })
      }

      const registryField = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields/${DATASET_CODE}/totalPopulation`,
        ),
        fixture.env,
      )
      expect(registryField.status).toBe(200)
      expect(await registryField.json()).toMatchObject({
        data: {
          type: 'statistic-fields',
          attributes: { measureCode: 'totalPopulation' },
          links: { availability: expect.stringContaining('/availability') },
        },
      })

      const availability = await app.fetch(
        new Request(
          `http://localhost/stats/v0.1/registry/fields/${DATASET_CODE}/totalPopulation/availability`,
        ),
        fixture.env,
      )
      expect(availability.status).toBe(200)
      expect(await availability.json()).toMatchObject({
        data: {
          type: 'statistic-field-availability',
          attributes: {
            referencePeriods: expect.arrayContaining([
              expect.objectContaining({
                code: '2021',
                geographies: [
                  expect.objectContaining({ kind: 'district', recordCount: 1 }),
                ],
                map: expect.stringContaining('/stats/v0.1/geographies?filter%5B'),
              }),
            ]),
          },
        },
      })

      const registryDimensions = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/dimensions'),
        fixture.env,
      )
      expect(registryDimensions.status).toBe(200)
      expect(await registryDimensions.json()).toMatchObject({
        data: [
          {
            type: 'statistic-dimensions',
            attributes: { code: 'sex', fieldCount: 2, value: 'all' },
          },
        ],
      })

      const registryDatasets = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/datasets'),
        fixture.env,
      )
      expect(registryDatasets.status).toBe(200)
      expect(await registryDatasets.json()).toMatchObject({
        data: [
          {
            type: 'statistic-datasets',
            id: HISTORICAL_DATASET_CODE,
            attributes: { fieldCount: 1, measureCount: 1 },
          },
          {
            type: 'statistic-datasets',
            id: DATASET_CODE,
            attributes: { fieldCount: 1, measureCount: 1 },
          },
        ],
      })

      const registrySearch = await app.fetch(
        new Request('http://localhost/stats/v0.1/registry/search?q=population'),
        fixture.env,
      )
      expect(registrySearch.status).toBe(200)
      expect(await registrySearch.json()).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'statistic-measures' }),
          expect.objectContaining({ type: 'statistic-fields' }),
        ]),
      })
    } finally {
      fixture.close()
    }
  })

  test('rejects generic and unsupported include names', async () => {
    const fixture = fixtureEnv()
    try {
      const response = await app.fetch(
        new Request('http://localhost/stats/v0.1?include=geometry'),
        fixture.env,
      )
      expect(response.status).toBe(422)
    } finally {
      fixture.close()
    }
  })

  test('returns direct curated-code maps and explicit multi-period series', async () => {
    const fixture = fixtureEnv()
    try {
      const geographies = await app.fetch(
        new Request(
          'http://localhost/stats/v0.1/geographies?filter[field]=totalPopulation&filter[referencePeriod]=2021',
        ),
        fixture.env,
      )
      expect(geographies.status).toBe(200)
      expect(await geographies.json()).toMatchObject({
        meta: {
          referencePeriod: '2021',
          geography: {
            kind: 'division',
            codeAttribute: 'divisionCode',
            domainCode: 'geographic',
            level: 2,
          },
        },
        values: { CW: '235953' },
      })

      const series = await app.fetch(
        new Request('http://localhost/stats/v0.1/series?filter[field]=totalPopulation'),
        fixture.env,
      )
      expect(series.status).toBe(200)
      const seriesBody = (await series.json()) as {
        valuesByReferencePeriod: Record<string, Record<string, string>>
      }
      expect(seriesBody.valuesByReferencePeriod).toEqual({
        '2020': { CW: '235953' },
        '2021': { CW: '235953' },
      })
      expect(
        Object.keys(seriesBody.valuesByReferencePeriod['2021'] ?? {}),
      ).not.toContain('division-central-western')
    } finally {
      fixture.close()
    }
  })
})
