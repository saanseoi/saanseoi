import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  OVERTURE_PRC_COUNTRY_ID,
  prepareOvertureCountryAnchor,
} from './overtureCountryAnchor'

test('an existing publisher country is retained without duplication or a lookup', async () => {
  const queries: string[] = []
  expect(
    await prepareOvertureCountryAnchor('/extract', '2026-09-23.0', async sql => {
      queries.push(sql)
      return [{ count: 1 }]
    }),
  ).toEqual({ filePath: '/extract' })
  expect(queries).toHaveLength(1)
})

test('duplicate anchors and unpinned versions fail closed', async () => {
  await expect(
    prepareOvertureCountryAnchor('/extract', 'latest', async () => []),
  ).rejects.toThrow('exact Overture release')
  await expect(
    prepareOvertureCountryAnchor('/extract', '2026-09-23.0', async () => [
      { count: 2 },
    ]),
  ).rejects.toThrow('duplicate')
})

for (const cacheHit of [false, true]) {
  test(
    cacheHit
      ? 'matching cached metadata is used without network access'
      : 'missing edition uses the reviewed fixture, never another edition',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'overture-anchor-test-'))
      const input = join(directory, "publisher's.parquet")
      await Bun.write(input, crypto.randomUUID())
      const raw = await Bun.file(input).text()
      const cacheVersion = cacheHit ? '2026-09-23.0' : '2026-08-19.0'
      const cacheDirectory = join(directory, cacheVersion, 'division')
      await mkdir(cacheDirectory, { recursive: true })
      const document = {
        id: OVERTURE_PRC_COUNTRY_ID,
        subtype: 'country',
        country: 'CN',
        names: { primary: '中国', common: [{ key: 'en', value: 'China' }] },
      }
      await Bun.write(
        join(cacheDirectory, `${OVERTURE_PRC_COUNTRY_ID}.json`),
        JSON.stringify(document),
      )
      let output: string | undefined
      let calls = 0
      try {
        const result = await prepareOvertureCountryAnchor(
          input,
          '2026-09-23.0',
          async sql => {
            if (++calls === 1) return [{ count: 0 }]
            expect(sql).not.toContain('s3://')
            expect(sql).toContain('count(*) = 1')
            expect(sql).toContain('INSERT INTO anchor BY NAME')
            const temporary = /TO '((?:[^']|'')+)' \(FORMAT/
              .exec(sql)?.[1]
              ?.replaceAll("''", "'")
            expect(temporary).toBeDefined()
            await Bun.write(temporary!, 'prepared extraction')
            return []
          },
          directory,
        )
        output = result.filePath
        expect(result.reference?.kind).toBe(
          cacheHit ? 'cached-publisher-metadata' : 'reviewed-hierarchy-reference',
        )
        expect(result.reference?.sha256).toMatch(/^[a-f0-9]{64}$/)
        if (cacheHit) expect(result.reference?.document).toEqual(document)
        else
          expect(result.reference?.document.fixture).toMatchObject({
            reviewStatus: 'reviewed',
          })
        expect(await Bun.file(input).text()).toBe(raw)
        expect(await Bun.file(output).text()).toBe('prepared extraction')
      } finally {
        if (output) await rm(output, { force: true })
        await rm(directory, { recursive: true, force: true })
      }
    },
  )
}

test('invalid matching cache fails rather than substituting the fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'overture-anchor-test-'))
  const cacheDirectory = join(directory, '2026-09-23.0', 'division')
  await mkdir(cacheDirectory, { recursive: true })
  await Bun.write(
    join(cacheDirectory, `${OVERTURE_PRC_COUNTRY_ID}.json`),
    JSON.stringify({ id: 'wrong-id' }),
  )
  try {
    await expect(
      prepareOvertureCountryAnchor(
        '/extract',
        '2026-09-23.0',
        async () => [{ count: 0 }],
        directory,
      ),
    ).rejects.toThrow('Invalid Overture country reference')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Parquet preflight reads the subtype needed to recognise the country reference', async () => {
  const { parquetWriteBuffer } = await import('hyparquet-writer')
  const { assertOvertureHongKongDivisionSourceAssumptions } = await import(
    '@repo/core/pipeline/services/divisions/division'
  )
  const buffer = parquetWriteBuffer({
    columnData: [
      { name: 'id', type: 'STRING', data: ['hk', OVERTURE_PRC_COUNTRY_ID] },
      { name: 'theme', type: 'STRING', data: ['divisions', 'divisions'] },
      { name: 'type', type: 'STRING', data: ['division', 'division'] },
      { name: 'subtype', type: 'STRING', data: ['region', 'country'] },
      { name: 'country', type: 'STRING', data: ['HK', 'CN'] },
      { name: 'region', type: 'STRING', data: [null, null] },
      { name: 'perspectives', type: 'JSON', data: [null, null] },
      { name: 'norms', type: 'JSON', data: [{ driving_side: 'left' }, null] },
      { name: 'names', type: 'JSON', data: [null, null] },
      { name: 'hierarchies', type: 'JSON', data: [[], []] },
    ],
  })
  await expect(
    assertOvertureHongKongDivisionSourceAssumptions({
      byteLength: buffer.byteLength,
      slice: async (start, end) => buffer.slice(start, end),
    }),
  ).resolves.toBeUndefined()
})
