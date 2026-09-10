import { expect, test } from 'bun:test'
import { readAuditPage, type ProvenanceStore } from '@repo/core/provenance'
import { retainDivisionProvenance } from '@repo/core/pipeline/services/divisionProvenance'
import { buildDivisionTranslationProcessingActions } from './processLocalDivisionSqlUploadTranslations'

test('C&SD translation applications retain applied decisions and only unused fixtures are skipped', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const translation = {
    context: { parentDivisionId: null, parentName: null },
    contextHash: 'context',
    entryKey: 'entry',
    locale: 'zh-hans' as const,
    name: '安达臣',
    provenance: 'human-translated' as const,
    sourceLocale: 'zh-hant' as const,
    sourceText: '安達臣',
    sourceTextHash: 'source',
  }
  const entry = {
    ...translation,
    targetLocale: translation.locale,
    text: translation.name,
    recordIds: ['anderson'],
  }
  const result = await retainDivisionProvenance(store, {
    releaseId: 'csd-release',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
    inputCount: 1,
    outputCount: 1,
    actions: buildDivisionTranslationProcessingActions({
      division: { id: 'anderson', level: null, type: 'housing-market-area' },
      rawNames: ['Anderson', '安達臣'],
      translations: [translation],
    }),
    curationDocuments: [
      {
        type: 'division-translations',
        document: {
          entries: [entry, { ...entry, sourceTextHash: 'other', recordIds: ['other'] }],
        },
      },
    ],
  })
  const page = await readAuditPage(store, result.manifest, '')
  expect(page.rows.map(row => row.outcome)).toEqual(['applied', 'skipped'])
  expect(page.rows[0]).toMatchObject({
    operation: 'division_name_human_translated',
    record: { id: 'anderson', names: ['Anderson', '安達臣', '安达臣'] },
    fixture: { pointer: '/entries/0' },
  })
  expect(page.rows[1]).toMatchObject({ id: 'unused-translation:0:1' })
})
