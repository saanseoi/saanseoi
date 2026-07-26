import type {
  LandsdStreetNameChangeScope,
  LandsdStreetNoticeApplicationDisposition,
  LandsdStreetNoticeApplicationMethod,
  StreetChangelogKind,
  StreetEvidenceAsset,
  StreetLocaleCode,
  StreetStatus,
} from '@repo/db'
import type { LandsdStreetSourceKind } from './landsdStreet.ts'

export type LandsdStreetLifecycleLocale = StreetLocaleCode

export type LandsdStreetLifecycleI18n = {
  description: string | null
  locale: LandsdStreetLifecycleLocale
  name: string
}

/** A narrowly-scoped textual amendment recorded by a Gazette corrigendum. */
export type LandsdStreetLifecycleTextCorrection = {
  fields: Array<
    | 'en.description'
    | 'en.name'
    | 'previousNoticeRefs'
    | 'zh-Hant.description'
    | 'zh-Hant.name'
  >
  from: string
  to: string
}

/** Immutable publisher event plus its explicit, persisted application decision. */
export type LandsdStreetLifecycleInput = {
  sourceStreetId: string | null
  resultStreetId: string | null
  districtIds: string[]
  disposition: LandsdStreetNoticeApplicationDisposition
  deferToNotices: boolean
  gazetteDate: string | null
  noticeType: string | null
  i18n: LandsdStreetLifecycleI18n[]
  method: LandsdStreetNoticeApplicationMethod | null
  nameChangeScope: LandsdStreetNameChangeScope | null
  noticeRef: string | null
  effectiveDate: string | null
  previousNoticeRefs: string[]
  retainedDescriptions: Partial<Record<LandsdStreetLifecycleLocale, string>> | null
  correction: LandsdStreetLifecycleTextCorrection | null
  evidenceAssets: StreetEvidenceAsset[]
  sourceKind: LandsdStreetSourceKind
  recordKey: string
  streetId: string | null
}

export type LandsdStreetChangelogEntry = {
  evidenceAssets: StreetEvidenceAsset[]
  effectiveDate: string | null
  isPartialNameChange: boolean
  kind: StreetChangelogKind
  gazetteDate: string | null
  noticeRef: string | null
  recordKey: string
  streetId: string
}

export type LandsdStreetMaterialisedStreet = {
  deletedAt: string | null
  districtIds: string[]
  gazetteDate: string | null
  i18n: LandsdStreetLifecycleI18n[]
  id: string
  sourceKeys: Record<string, unknown>
  status: StreetStatus
  version: number
}

export type LandsdStreetLifecycleStats = {
  added: number
  changed: number
  deleted: number
  noOpEvents: number
  restored: number
  versionsCreated: number
}
export type LandsdStreetLifecycleResult = {
  changed: LandsdStreetMaterialisedStreet[]
  changelog: LandsdStreetChangelogEntry[]
  current: LandsdStreetMaterialisedStreet[]
  stats: LandsdStreetLifecycleStats
}

/**
 * The reducer never resolves a street from `Previous G.N.`. Those references
 * are publisher provenance only; applications provide the reviewed target ID.
 */
export function materialiseLandsdStreetLifecycle(input: {
  current: LandsdStreetMaterialisedStreet[]
  events: LandsdStreetLifecycleInput[]
}): LandsdStreetLifecycleResult {
  const streets = new Map(
    input.current.map(street => [street.id, cloneStreet(street)] as const),
  )
  const changed: LandsdStreetMaterialisedStreet[] = []
  const changelog: LandsdStreetChangelogEntry[] = []
  const stats: LandsdStreetLifecycleStats = {
    added: 0,
    changed: 0,
    deleted: 0,
    noOpEvents: 0,
    restored: 0,
    versionsCreated: 0,
  }

  for (const event of [...input.events].sort(compareEvents)) {
    if (event.sourceKind === 'baseline') {
      if (event.deferToNotices) {
        // This refreshed PDF row is covered by a notice application; it is a
        // reconciliation record, not another canonical origin.
        continue
      }
      if (!event.streetId)
        throw new Error(`Baseline ${event.recordKey} has no persisted street ID.`)
      const previous = streets.get(event.streetId)
      const next = makeStreet(event, event.streetId, previous?.version ?? 0)
      if (previous && sameMaterialisedState(previous, next)) {
        stats.noOpEvents += 1
        continue
      }
      streets.set(next.id, next)
      changed.push(next)
      changelog.push(changelogEntry(next, event, 'gazette'))
      if (previous) stats.changed += 1
      else stats.added += 1
      stats.versionsCreated += 1
      continue
    }

    if (event.disposition === 'noOp') {
      stats.noOpEvents += 1
      continue
    }
    const type = event.noticeType
    if (type === 'intention') {
      if (event.sourceStreetId) {
        const street = requireStreet(streets, event.sourceStreetId, event)
        changelog.push(changelogEntry(street, event, 'notice_of_name_change'))
      }
      stats.noOpEvents += 1
      continue
    }
    if (type === 'declaration') {
      if (!event.resultStreetId)
        throw new Error(`Declaration ${event.recordKey} requires resultStreetId.`)
      if (streets.has(event.resultStreetId))
        throw new Error(
          `Declaration ${event.recordKey} creates existing street ${event.resultStreetId}.`,
        )
      const next = makeStreet(event, event.resultStreetId, 0)
      streets.set(next.id, next)
      changed.push(next)
      changelog.push(changelogEntry(next, event, 'gazette'))
      stats.added += 1
      stats.versionsCreated += 1
      continue
    }
    if (!event.sourceStreetId)
      throw new Error(
        `Notice ${event.recordKey} (${type ?? 'unknown'}) requires sourceStreetId in its application.`,
      )
    const target = requireStreet(streets, event.sourceStreetId, event)

    if (type === 'change' && event.resultStreetId) {
      const replacement = makeStreet(event, event.resultStreetId, 0)
      if (streets.has(replacement.id))
        throw new Error(
          `Notice ${event.recordKey} creates existing street ${replacement.id}.`,
        )
      const previous =
        event.nameChangeScope === 'partial'
          ? applyPartialNameChange(target, event)
          : applyNotice(target, { ...event, noticeType: 'deletion' })
      streets.set(previous.id, previous)
      streets.set(replacement.id, replacement)
      changed.push(previous, replacement)
      changelog.push(
        changelogEntry(previous, event, 'name_change'),
        changelogEntry(replacement, event, 'name_change'),
      )
      stats.changed += 1
      stats.added += 1
      stats.versionsCreated += 2
      if (previous.status === 'deleted') stats.deleted += 1
      continue
    }

    const next = applyNotice(target, event)
    // A corrigendum is a publisher-issued amendment and must be represented in
    // the version history even where today's reconciliation baseline already
    // contains the corrected spelling.
    if (sameMaterialisedState(target, next) && !event.correction) {
      stats.noOpEvents += 1
      continue
    }
    streets.set(next.id, next)
    changed.push(next)
    changelog.push(
      changelogEntry(
        next,
        event,
        type === 'deletion'
          ? 'deleted'
          : event.correction
            ? 'corrigendum'
            : 'description_change',
      ),
    )
    stats.changed += 1
    stats.versionsCreated += 1
    if (target.status !== 'deleted' && next.status === 'deleted') stats.deleted += 1
    if (target.status === 'deleted' && next.status === 'active') stats.restored += 1
  }
  return {
    changed,
    changelog,
    current: [...streets.values()]
      .filter(street => street.status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id)),
    stats,
  }
}

function makeStreet(
  event: LandsdStreetLifecycleInput,
  id: string,
  version: number,
): LandsdStreetMaterialisedStreet {
  return {
    deletedAt: null,
    districtIds: [...event.districtIds],
    gazetteDate: event.gazetteDate,
    i18n: cloneI18n(event.i18n),
    id,
    sourceKeys: {
      hkgovLandsd: {
        baselineRecordKeys: event.sourceKind === 'baseline' ? [event.recordKey] : [],
        noticeRecordKeys: event.sourceKind === 'baseline' ? [] : [event.recordKey],
      },
    },
    status: 'active',
    version: version + 1,
  }
}
function applyNotice(
  current: LandsdStreetMaterialisedStreet,
  event: LandsdStreetLifecycleInput,
): LandsdStreetMaterialisedStreet {
  const deletion = event.noticeType === 'deletion'
  return {
    ...cloneStreet(current),
    deletedAt: deletion ? event.effectiveDate : null,
    districtIds: event.districtIds.length
      ? [...event.districtIds]
      : [...current.districtIds],
    gazetteDate: event.gazetteDate,
    i18n: deletion
      ? cloneI18n(current.i18n)
      : event.correction
        ? applyCorrection(current.i18n, event.correction)
        : mergeI18n(current.i18n, event.i18n),
    sourceKeys: appendSourceKey(current.sourceKeys, event),
    status: deletion ? 'deleted' : 'active',
    version: current.version + 1,
  }
}

function applyCorrection(
  current: LandsdStreetLifecycleI18n[],
  correction: LandsdStreetLifecycleTextCorrection,
) {
  return current.map(item => {
    const nameField =
      `${item.locale}.name` as LandsdStreetLifecycleTextCorrection['fields'][number]
    const descriptionField =
      `${item.locale}.description` as LandsdStreetLifecycleTextCorrection['fields'][number]
    return {
      ...item,
      ...(correction.fields.includes(nameField)
        ? { name: replaceCorrectionText(item.name, correction) }
        : {}),
      ...(item.description !== null && correction.fields.includes(descriptionField)
        ? {
            description: replaceCorrectionText(item.description, correction),
          }
        : {}),
    }
  })
}

function replaceCorrectionText(
  value: string,
  correction: LandsdStreetLifecycleTextCorrection,
) {
  return value.replaceAll(
    new RegExp(escapeRegularExpression(correction.from), 'giu'),
    correction.to,
  )
}

function escapeRegularExpression(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function applyPartialNameChange(
  current: LandsdStreetMaterialisedStreet,
  event: LandsdStreetLifecycleInput,
) {
  const next = applyNotice(current, event)
  return {
    ...next,
    i18n: next.i18n.map(locale => ({
      ...locale,
      name: current.i18n.find(old => old.locale === locale.locale)?.name ?? locale.name,
      description: event.retainedDescriptions?.[locale.locale] ?? locale.description,
    })),
  }
}
function requireStreet(
  streets: Map<string, LandsdStreetMaterialisedStreet>,
  id: string,
  event: LandsdStreetLifecycleInput,
) {
  const street = streets.get(id)
  if (!street)
    throw new Error(
      `Notice ${event.recordKey} application targets missing street ${id}.`,
    )
  return street
}
function changelogEntry(
  street: LandsdStreetMaterialisedStreet,
  event: LandsdStreetLifecycleInput,
  kind: LandsdStreetChangelogEntry['kind'],
): LandsdStreetChangelogEntry {
  return {
    evidenceAssets: [...event.evidenceAssets],
    effectiveDate: event.effectiveDate,
    isPartialNameChange: event.nameChangeScope === 'partial',
    kind,
    gazetteDate: event.gazetteDate,
    noticeRef: event.noticeRef,
    recordKey: event.recordKey,
    streetId: street.id,
  }
}
function mergeI18n(
  current: LandsdStreetLifecycleI18n[],
  incoming: LandsdStreetLifecycleI18n[],
) {
  const byLocale = new Map(incoming.map(item => [item.locale, item] as const))
  return current.map(old => {
    const next = byLocale.get(old.locale)
    return next
      ? { ...next, description: next.description ?? old.description }
      : { ...old }
  })
}
function appendSourceKey(
  sourceKeys: Record<string, unknown>,
  event: LandsdStreetLifecycleInput,
) {
  const root =
    sourceKeys.hkgovLandsd && typeof sourceKeys.hkgovLandsd === 'object'
      ? (sourceKeys.hkgovLandsd as Record<string, unknown>)
      : {}
  const noticeRecordKeys = Array.isArray(root.noticeRecordKeys)
    ? root.noticeRecordKeys.filter((x): x is string => typeof x === 'string')
    : []
  return {
    ...sourceKeys,
    hkgovLandsd: {
      ...root,
      noticeRecordKeys: [...new Set([...noticeRecordKeys, event.recordKey])].sort(),
    },
  }
}
function sameMaterialisedState(
  a: LandsdStreetMaterialisedStreet,
  b: LandsdStreetMaterialisedStreet,
) {
  return JSON.stringify(fingerprint(a)) === JSON.stringify(fingerprint(b))
}
function fingerprint(street: LandsdStreetMaterialisedStreet) {
  return {
    deletedAt: street.deletedAt,
    districtIds: [...street.districtIds].sort(),
    i18n: [...street.i18n]
      .sort((a, b) => a.locale.localeCompare(b.locale))
      .map(({ locale, name, description }) => ({ locale, name, description })),
    status: street.status,
  }
}
function compareEvents(a: LandsdStreetLifecycleInput, b: LandsdStreetLifecycleInput) {
  return `${a.effectiveDate ?? a.gazetteDate ?? ''}\0${a.gazetteDate ?? ''}\0${a.recordKey}`.localeCompare(
    `${b.effectiveDate ?? b.gazetteDate ?? ''}\0${b.gazetteDate ?? ''}\0${b.recordKey}`,
  )
}
function cloneStreet(
  street: LandsdStreetMaterialisedStreet,
): LandsdStreetMaterialisedStreet {
  return {
    ...street,
    districtIds: [...street.districtIds],
    i18n: cloneI18n(street.i18n),
    sourceKeys: structuredClone(street.sourceKeys),
  }
}
function cloneI18n(items: LandsdStreetLifecycleI18n[]) {
  return items.map(item => ({ ...item }))
}
