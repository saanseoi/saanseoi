import { expect, test } from 'bun:test'
import { readAuditPage, type ProvenanceStore } from '@repo/core/provenance'
import { retainDivisionProvenance } from '@repo/core/pipeline/services/divisions/divisionProvenance'
import { buildDivisionTranslationProcessingActions } from './processLocalDivisionSqlUploadTranslations'

test('C&SD translation applications retain applied decisions and aggregate unused fixture counts', async () => {
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
    scope: { stage: 'ingestion', ownerId: 'csd-release' },
    resourceReleaseId: 'csd-release',
    datasetCode: 'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
    inputCount: 1,
    outputCount: 1,
    actions: buildDivisionTranslationProcessingActions({
      division: { id: 'anderson', level: null, class: 'housing-market-area' },
      rawNames: {
        primary: 'Anderson',
        common: { 'zh-Hant': '安達臣' },
        rules: undefined,
      },
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
  expect(page.rows.map(row => row.outcome)).toEqual(['applied'])
  expect(page.rows[0]).toMatchObject({
    operation: 'apply-division-name-translation',
    record: { id: '/entries/0', names: ['安达臣'] },
    context: { recordIds: ['anderson'], entryKey: 'entry' },
    fixture: { pointer: '/entries/0' },
  })
  expect(
    result.manifest.bulk.find(
      rule => rule.id === 'summarise-division-name-translations',
    )?.counts.decisions,
  ).toEqual({ applied: 1, selectedInstructions: 1, unusedInstructions: 1 })
  expect(
    [...objects.values()].map(bytes => new TextDecoder().decode(bytes)).join(''),
  ).not.toContain('division-translation-curations')
})
