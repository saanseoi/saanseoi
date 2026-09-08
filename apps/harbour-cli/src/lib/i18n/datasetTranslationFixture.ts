import { createHash } from 'node:crypto'
import type { FixtureEntry } from './datasetNameTranslations'

type Translation = Pick<
  FixtureEntry,
  | 'field'
  | 'sourceLocale'
  | 'sourceText'
  | 'sourceTextHash'
  | 'targetLocale'
  | 'text'
  | 'provenance'
  | 'machine'
>
type Usage = Pick<
  FixtureEntry,
  'firstSeenRelease' | 'lastSeenRelease' | 'recordIds'
> & { context: string; translation: string }
export type TranslationMapFixture = {
  version: 2
  datasetCode: string
  contexts: Record<string, FixtureEntry['context']>
  translations: Record<string, Translation>
  usages: Record<string, Usage>
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sorted = <T>(map: Record<string, T>) =>
  Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))

/** Normalise storage without collapsing context-sensitive translation choices. */
export function translationMap(
  datasetCode: string,
  entries: FixtureEntry[],
): TranslationMapFixture {
  const contexts: TranslationMapFixture['contexts'] = {}
  const translations: TranslationMapFixture['translations'] = {}
  const usages: TranslationMapFixture['usages'] = {}
  for (const entry of entries) {
    const {
      field,
      sourceLocale,
      sourceText,
      sourceTextHash,
      targetLocale,
      text,
      provenance,
      machine,
    } = entry
    const translation: Translation = {
      field,
      sourceLocale,
      sourceText,
      sourceTextHash,
      targetLocale,
      text,
      provenance,
      ...(machine ? { machine } : {}),
    }
    const translationId = hash(translation)
    const usageId = hash([
      entry.contextHash,
      field,
      sourceLocale,
      sourceTextHash,
      targetLocale,
    ])
    const existing = usages[usageId]
    if (existing && existing.translation !== translationId)
      throw new Error('Conflicting dataset i18n fixture entries')
    // Display locales can be enriched as more releases are processed.
    contexts[entry.contextHash] = { ...contexts[entry.contextHash], ...entry.context }
    translations[translationId] = translation
    usages[usageId] = {
      context: entry.contextHash,
      translation: translationId,
      firstSeenRelease: [
        existing?.firstSeenRelease ?? entry.firstSeenRelease,
        entry.firstSeenRelease,
      ].sort()[0]!,
      lastSeenRelease: [
        existing?.lastSeenRelease ?? entry.lastSeenRelease,
        entry.lastSeenRelease,
      ]
        .sort()
        .at(-1)!,
      recordIds: [
        ...new Set([...(existing?.recordIds ?? []), ...(entry.recordIds ?? [])]),
      ].sort(),
    }
  }
  return {
    datasetCode,
    version: 2,
    contexts: sorted(contexts),
    translations: sorted(translations),
    usages: sorted(usages),
  }
}

export function translationEntries(fixture: TranslationMapFixture): FixtureEntry[] {
  if (
    fixture.version !== 2 ||
    !fixture.contexts ||
    !fixture.translations ||
    !fixture.usages
  )
    throw new Error('Invalid dataset i18n translation map')
  return Object.values(fixture.usages).map(usage => {
    const context = fixture.contexts[usage.context]
    const translation = fixture.translations[usage.translation]
    if (!context || !translation)
      throw new Error('Dangling dataset i18n translation reference')
    return {
      ...translation,
      context,
      contextHash: usage.context,
      firstSeenRelease: usage.firstSeenRelease,
      lastSeenRelease: usage.lastSeenRelease,
      recordIds: usage.recordIds,
    }
  })
}
