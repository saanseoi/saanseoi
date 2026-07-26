import { isCancel, note, select, text } from '@clack/prompts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type {
  LandsdStreetNameChangeScope,
  LandsdStreetNoticeApplicationDisposition,
  LandsdStreetNoticeApplicationMethod,
  LandsdStreetNoticeType,
} from '@repo/db'

import {
  parseLandsdChineseNoticeDateCorrigendum,
  type PairedLandsdGovernmentNoticePdfEntry,
  type PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import { mintLandsdStreetId } from './landsdStreetIds.ts'

type LandsdStreetReviewableNoticeType = Extract<
  LandsdStreetNoticeType,
  'change' | 'corrigendum' | 'intention'
>

export type LandsdStreetCurationDisposition =
  | LandsdStreetNoticeApplicationDisposition
  | 'defer'
export type LandsdStreetCorrectionField =
  | 'en.description'
  | 'en.name'
  | 'previousNoticeRefs'
  | 'zh-Hant.description'
  | 'zh-Hant.name'
export type LandsdStreetTextCorrection = {
  fields: LandsdStreetCorrectionField[]
  from: string
  to: string
}
export type LandsdStreetIntentionRename = {
  from: string
  locale: 'en' | 'zh-Hant'
  to: string
}
export type LandsdStreetCurationDecision = {
  affectedStreetId?: string
  createdStreetId?: string
  disposition: LandsdStreetCurationDisposition
  nameChangeScope?: LandsdStreetNameChangeScope
  retainedDescriptions?: { en: string; zhHant: string }
  sourceRecordId: string
}
export type LandsdStreetCurationManifest = {
  decisions: LandsdStreetCurationDecision[]
  schemaVersion: 2
}
export type LandsdStreetBaselineCandidate = {
  districtCodes: string[]
  names: { en: string; zhHant: string }
  recordKey: string
  streetId: string
}
export type LandsdStreetLifecycleReview = {
  automaticApplication: {
    affectedStreetId: string
    correction: LandsdStreetTextCorrection | null
    method: 'automatic'
  } | null
  baselineCandidates: LandsdStreetBaselineCandidate[]
  curation: LandsdStreetCurationDecision | null
  descriptions: { en: string | null; zhHant: string | null }
  governmentNoticeType: LandsdStreetReviewableNoticeType
  governmentNoticeUrls: { en: string | null; zhHant: string | null }
  name: { en: string; zhHant: string }
  chineseNoticeDateCorrigendum: {
    correctedDate: string
    erroneousDate: string
    targetNoticeRef: string
  } | null
  sourceName: { en: string; zhHant: string }
  noticeIdentity: string | null
  operation: 'description-change' | 'name-change' | 'corrigendum' | 'intention'
  correction: LandsdStreetTextCorrection | null
  intentionSummary: string | null
  intentionRename: LandsdStreetIntentionRename | null
  parsedPreviousNoticeRefs: string[]
  publicationDate: string
  sourceRecordId: string
}
export type LandsdStreetAppliedCuration = {
  affectedStreetId: string | null
  correction: LandsdStreetTextCorrection | null
  createdStreetId: string | null
  disposition: LandsdStreetNoticeApplicationDisposition
  method: LandsdStreetNoticeApplicationMethod
  nameChangeScope: LandsdStreetNameChangeScope | null
  retainedDescriptions: { en: string; zhHant: string } | null
}

export async function loadLandsdStreetCuration(path: string) {
  try {
    return parseLandsdStreetCuration(JSON.parse(await readFile(path, 'utf8')), path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return emptyLandsdStreetCuration()
    throw error
  }
}
export async function saveLandsdStreetCuration(
  path: string,
  manifest: LandsdStreetCurationManifest,
) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Prompt only for decisions parser facts cannot safely supply. */
export async function promptForLandsdStreetCuration(input: {
  manifest: LandsdStreetCurationManifest
  review: LandsdStreetLifecycleReview[]
}) {
  const decisions = [...input.manifest.decisions]
  for (const item of input.review.filter(entry => !entry.curation)) {
    note(
      formatLifecycleReviewContext(item),
      `NOTICE CONTEXT${
        item.governmentNoticeType === 'corrigendum' ? ' : CORRIGENDUM' : ''
      }`,
    )
    const disposition = await select({
      message: `${item.governmentNoticeType}: ${item.name.en} / ${item.name.zhHant}`,
      options: [
        { value: 'apply' as const, label: applyLabel(item) },
        { value: 'noOp' as const, label: 'Record as no material street-state change' },
        { value: 'defer' as const, label: 'Defer and block this snapshot' },
      ],
    })
    if (isCancel(disposition)) throw new Error('LandsD lifecycle review cancelled.')
    let affectedStreetId: string | undefined
    let createdStreetId: string | undefined
    let nameChangeScope: LandsdStreetNameChangeScope | undefined
    let retainedDescriptions: { en: string; zhHant: string } | undefined
    if (disposition === 'apply') {
      affectedStreetId = await selectAffectedStreetId(item)
      if (item.operation === 'name-change') {
        const scope = await select({
          message: 'Name-change scope',
          options: [
            { value: 'whole' as const, label: 'Whole street' },
            { value: 'partial' as const, label: 'Part of street' },
          ],
        })
        if (isCancel(scope)) throw new Error('LandsD lifecycle review cancelled.')
        nameChangeScope = scope
        const created = await text({
          message: 'New canonical street ID',
          initialValue: mintLandsdStreetId(),
          validate: value =>
            (value ?? '').trim() ? undefined : 'Enter a new opaque UUID.',
        })
        if (isCancel(created)) throw new Error('LandsD lifecycle review cancelled.')
        createdStreetId = (created ?? '').trim()
        if (scope === 'partial') {
          const en = await text({
            message: 'Retained portion description (English)',
            validate: value => ((value ?? '').trim() ? undefined : 'Required.'),
          })
          const zhHant = await text({
            message: 'Retained portion description (Traditional Chinese)',
            validate: value => ((value ?? '').trim() ? undefined : 'Required.'),
          })
          if (isCancel(en) || isCancel(zhHant))
            throw new Error('LandsD lifecycle review cancelled.')
          retainedDescriptions = {
            en: (en ?? '').trim(),
            zhHant: (zhHant ?? '').trim(),
          }
        }
      }
    }
    decisions.push({
      sourceRecordId: item.sourceRecordId,
      disposition,
      ...(affectedStreetId ? { affectedStreetId } : {}),
      ...(createdStreetId ? { createdStreetId } : {}),
      ...(nameChangeScope ? { nameChangeScope } : {}),
      ...(retainedDescriptions ? { retainedDescriptions } : {}),
    })
  }
  return { schemaVersion: 2 as const, decisions }
}
export function emptyLandsdStreetCuration(): LandsdStreetCurationManifest {
  return { schemaVersion: 2, decisions: [] }
}
export function resolveLandsdStreetCuration(input: {
  baselineCandidates?: readonly LandsdStreetBaselineCandidate[]
  manifest: LandsdStreetCurationManifest
  notices: PairedLandsdStreetNotice[]
  parsedEntries: ReadonlyMap<string, PairedLandsdGovernmentNoticePdfEntry>
}) {
  const reviewable = input.notices.filter(
    (
      notice,
    ): notice is PairedLandsdStreetNotice & {
      governmentNoticeType: LandsdStreetReviewableNoticeType
    } =>
      notice.governmentNoticeType === 'change' ||
      notice.governmentNoticeType === 'corrigendum' ||
      notice.governmentNoticeType === 'intention',
  )
  const decisions = new Map(
    input.manifest.decisions.map(item => [item.sourceRecordId, item] as const),
  )
  const IDs = new Set(reviewable.map(notice => notice.id))
  for (const decision of input.manifest.decisions)
    if (!IDs.has(decision.sourceRecordId))
      throw new Error(
        `LandsD curation ${decision.sourceRecordId} does not identify a change, corrigendum, or intention notice in the current source.`,
      )
  const review = reviewable.map(notice => {
    const parsed = input.parsedEntries.get(notice.id)
    const correction = corrigendumCorrectionFor(notice, parsed)
    const name = correctedNoticeName(notice.names, correction)
    const baselineCandidates = matchingBaselineCandidates(
      input.baselineCandidates ?? [],
      name.en,
    )
    const operation = lifecycleOperationFor(notice, parsed)
    const intentionRename = intentionRenameFor(notice, parsed)
    const intentionSummary = intentionSummaryFor(notice, parsed)
    const chineseNoticeDateCorrigendum = parseLandsdChineseNoticeDateCorrigendum(
      parsed?.rawExtractedText?.en ?? '',
    )
    const automaticApplication =
      (operation === 'description-change' ||
        Boolean(correction) ||
        Boolean(intentionRename)) &&
      baselineCandidates.length === 1
        ? baselineCandidates[0]
          ? {
              affectedStreetId: baselineCandidates[0].streetId,
              correction,
              method: 'automatic' as const,
            }
          : null
        : null
    return {
      automaticApplication,
      curation: decisions.get(notice.id) ?? null,
      baselineCandidates,
      correction,
      chineseNoticeDateCorrigendum,
      intentionSummary,
      intentionRename,
      descriptions: parsed?.descriptions ?? { en: null, zhHant: null },
      governmentNoticeType: notice.governmentNoticeType,
      governmentNoticeUrls: {
        en: notice.governmentNotices.en?.url ?? null,
        zhHant: notice.governmentNotices.zhHant?.url ?? null,
      },
      name,
      sourceName: notice.names,
      noticeIdentity: notice.noticeIdentity,
      operation,
      parsedPreviousNoticeRefs: parsed?.previousNoticeRefs ?? [],
      publicationDate: notice.publicationDate,
      sourceRecordId: notice.id,
    } satisfies LandsdStreetLifecycleReview
  })
  const unresolved = review.filter(item => {
    const decision = item.curation
    return !decision
      ? !item.automaticApplication && !item.chineseNoticeDateCorrigendum
      : decision.disposition === 'defer' ||
          (decision.disposition === 'apply' && !decision.affectedStreetId)
  })
  const applied = new Map<string, LandsdStreetAppliedCuration>()
  for (const item of review) {
    const decision = item.curation
    if (!decision && item.chineseNoticeDateCorrigendum) {
      applied.set(item.sourceRecordId, {
        affectedStreetId: null,
        correction: null,
        createdStreetId: null,
        disposition: 'noOp',
        method: 'automatic',
        nameChangeScope: null,
        retainedDescriptions: null,
      })
      continue
    }
    if (!decision && item.automaticApplication) {
      applied.set(item.sourceRecordId, {
        affectedStreetId: item.automaticApplication.affectedStreetId,
        correction: item.automaticApplication.correction,
        createdStreetId: null,
        disposition: 'apply',
        method: item.automaticApplication.method,
        nameChangeScope: null,
        retainedDescriptions: null,
      })
      continue
    }
    if (!decision || decision.disposition === 'defer') continue
    if (
      decision.disposition === 'apply' &&
      item.operation === 'name-change' &&
      !decision.createdStreetId
    )
      throw new Error(
        `LandsD name change ${decision.sourceRecordId} requires createdStreetId.`,
      )
    applied.set(item.sourceRecordId, {
      affectedStreetId: decision.affectedStreetId ?? null,
      correction: item.correction,
      createdStreetId: decision.createdStreetId ?? null,
      disposition: decision.disposition,
      method: 'manual',
      nameChangeScope: decision.nameChangeScope ?? null,
      retainedDescriptions: decision.retainedDescriptions ?? null,
    })
  }
  return { applied, review, unresolved }
}

async function selectAffectedStreetId(item: LandsdStreetLifecycleReview) {
  if (item.baselineCandidates.length === 1) {
    const [candidate] = item.baselineCandidates
    if (!candidate) throw new Error('Expected exactly one baseline candidate.')
    note(formatBaselineCandidate(candidate), 'SELECTED BASELINE STREET')
    return candidate.streetId
  }
  if (item.baselineCandidates.length > 1) {
    const selected = await select({
      message: 'Affected baseline street',
      options: [
        ...item.baselineCandidates.map(candidate => ({
          value: candidate.streetId,
          label: `${candidate.names.en} / ${candidate.names.zhHant}`,
          hint: `districts: ${candidate.districtCodes.join(', ') || 'unknown'}; ID: ${candidate.streetId}`,
        })),
        {
          value: 'manual',
          label: 'Enter a different reviewed canonical street ID',
        },
      ],
    })
    if (isCancel(selected)) throw new Error('LandsD lifecycle review cancelled.')
    if (selected !== 'manual') return selected
  }
  const affected = await text({
    message: 'Affected canonical street ID',
    validate: value =>
      (value ?? '').trim() ? undefined : 'Enter the reviewed canonical street ID.',
  })
  if (isCancel(affected)) throw new Error('LandsD lifecycle review cancelled.')
  return (affected ?? '').trim()
}

function matchingBaselineCandidates(
  candidates: readonly LandsdStreetBaselineCandidate[],
  englishName: string,
) {
  const name = normaliseEnglishName(englishName)
  return candidates.filter(
    candidate => normaliseEnglishName(candidate.names.en) === name,
  )
}

function normaliseEnglishName(value: string) {
  return value.toLocaleUpperCase('en').replaceAll(/\s+/g, ' ').trim()
}

export function formatLifecycleReviewContext(item: LandsdStreetLifecycleReview) {
  return [
    formatReviewField('Publication date', [item.publicationDate]),
    formatReviewField('Notice', [item.name.en, item.name.zhHant]),
    formatReviewField('Description (EN)', [item.descriptions.en ?? '—']),
    item.descriptions.zhHant
      ? formatReviewField('Description (ZH-Hant)', [item.descriptions.zhHant ?? '—'])
      : null,
    item.parsedPreviousNoticeRefs.length > 0
      ? formatReviewField('Previous G.N.', item.parsedPreviousNoticeRefs)
      : null,
    item.correction ? formatCorrection(item.correction, item.sourceName) : null,
    item.intentionSummary
      ? formatReviewField('Proposed action', [item.intentionSummary])
      : null,
    item.intentionRename ? formatIntentionRename(item.intentionRename) : null,
    formatReviewField('English PDF', [item.governmentNoticeUrls.en ?? '—'], 'muted'),
    item.baselineCandidates.length === 0
      ? formatReviewField('Matching baseline streets', ['none'])
      : `${reviewKey('Matching baseline streets')}:\n${item.baselineCandidates.map(formatBaselineCandidate).join('\n')}`,
    item.automaticApplication
      ? formatReviewField('Automatic application', [
          item.automaticApplication.affectedStreetId,
        ])
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}

function applyLabel(item: LandsdStreetLifecycleReview) {
  if (item.correction)
    return `Apply ${formatCorrectionFields(item.correction.fields)} correction: ${item.correction.from} → ${item.correction.to}`
  if (item.operation === 'description-change') return 'Apply description change'
  if (item.operation === 'name-change') return 'Apply name change'
  if (item.intentionSummary) return `Record intention: ${item.intentionSummary}`
  if (item.intentionRename)
    return `Record intention to rename ${intentionRenameLabel(item.intentionRename)}: ${item.intentionRename.from} → ${item.intentionRename.to}`
  if (item.operation === 'intention') return 'Record reviewed intention notice'
  return 'Apply reviewed corrigendum'
}

function formatIntentionRename(rename: LandsdStreetIntentionRename) {
  return formatReviewField(`Intended ${intentionRenameLabel(rename)}`, [
    rename.from,
    rename.to,
  ])
}

function intentionRenameLabel(rename: LandsdStreetIntentionRename) {
  return `${rename.locale === 'zh-Hant' ? 'Chinese' : 'English'}-name rename`
}

function formatCorrection(
  correction: LandsdStreetTextCorrection,
  sourceName: { en: string; zhHant: string },
) {
  return correction.fields
    .map(field => {
      if (field.endsWith('.name')) {
        const locale = field.startsWith('zh-Hant') ? 'zhHant' : 'en'
        const from = sourceName[locale]
        return formatReviewField(`${formatCorrectionFields([field])} correction`, [
          from,
          from.replaceAll(correction.from, correction.to),
        ])
      }
      return formatReviewField(`${formatCorrectionFields([field])} correction`, [
        `${correction.from} → ${correction.to}`,
      ])
    })
    .join('\n')
}

function formatCorrectionFields(fields: LandsdStreetCorrectionField[]) {
  const labels = fields.map(field => {
    if (field === 'en.name') return 'English name'
    if (field === 'zh-Hant.name') return 'Chinese name'
    if (field === 'en.description') return 'English description'
    if (field === 'previousNoticeRefs') return 'Previous G.N.'
    return 'Chinese description'
  })
  return labels.join(' and ')
}

function formatBaselineCandidate(candidate: LandsdStreetBaselineCandidate) {
  return `  ${formatReviewField('Street', [candidate.names.en, candidate.names.zhHant])}\n  ${formatReviewField('Districts', candidate.districtCodes.length > 0 ? candidate.districtCodes : ['unknown'])}\n  ${formatReviewField('Street ID', [candidate.streetId], 'muted')}`
}

function formatReviewField(
  label: string,
  values: string[],
  valueStyle: 'default' | 'muted' = 'default',
) {
  return `${reviewKey(label)}: ${values
    .map((value, index) => reviewValue(value, index, valueStyle))
    .join(reviewSeparator())}`
}

function reviewKey(value: string) {
  return `\u001B[36m${value}\u001B[39m`
}

function reviewValue(value: string, index: number, valueStyle: 'default' | 'muted') {
  if (valueStyle === 'muted') return `\u001B[90m${value}\u001B[39m`
  const colours = [33, 32, 35]
  return `\u001B[${colours[index % colours.length]}m${value}\u001B[39m`
}

function reviewSeparator() {
  return ' \u001B[90m/\u001B[39m '
}

function lifecycleOperationFor(
  notice: PairedLandsdStreetNotice,
  parsed: PairedLandsdGovernmentNoticePdfEntry | undefined,
) {
  if (notice.governmentNoticeType === 'intention') return 'intention' as const
  if (notice.governmentNoticeType === 'corrigendum') return 'corrigendum' as const
  const english = (parsed?.rawExtractedText?.en ?? '').replaceAll(/\s+/g, ' ')
  const chinese = (parsed?.rawExtractedText?.zhHant ?? '').replaceAll(/\s+/g, ' ')
  if (
    /\bdescription\s+of\b.*\b(?:will|shall)\s+replace\b|\b(?:Replacing|Replacement of)\s+(?:the\s+)?Description\b/i.test(
      english,
    ) ||
    /(?:取代|更改).*?(?:街道)?(?:說明|描述)/u.test(chinese)
  )
    return 'description-change' as const
  return 'name-change' as const
}

function intentionRenameFor(
  notice: PairedLandsdStreetNotice,
  parsed: PairedLandsdGovernmentNoticePdfEntry | undefined,
): LandsdStreetIntentionRename | null {
  if (notice.governmentNoticeType !== 'intention') return null
  const english = (parsed?.rawExtractedText?.en ?? '').replaceAll(/\s+/g, ' ')
  const match = english.match(
    /intends\s+to\s+make\s+a\s+declaration\s+to\s+rename\s+the\s+(?:(Chinese|English)\s+)?street\s+name\s+of\s+.+?\s+from\s+[‘'“"]?(.+?)[’'”"]?\s+to\s+[‘'“"]?(.+?)[’'”"]?(?:\s+in\s+.+?|\s+as\s+described\s+hereunder)?\s*(?:[:.—]|$)/i,
  )
  const from = match?.[2]?.trim()
  const to = match?.[3]?.trim()
  if (!from || !to) return null
  return {
    from,
    locale: match?.[1]?.toLocaleLowerCase('en') === 'english' ? 'en' : 'zh-Hant',
    to,
  }
}

function intentionSummaryFor(
  notice: PairedLandsdStreetNotice,
  parsed: PairedLandsdGovernmentNoticePdfEntry | undefined,
) {
  if (notice.governmentNoticeType !== 'intention') return null
  const english = (parsed?.rawExtractedText?.en ?? '').replaceAll(/\s+/g, ' ')
  const directSectionRename = english.match(
    /rename\s+a\s+section\s+of\s+(.+?)\s+as\s+a\s+section\s+of\s+(.+?)(?:\s+and\s+to\s+cease|\s+as\s+described|[:.—]|$)/i,
  )
  // Some notices identify the source section through an earlier G.N. rather
  // than saying "as a section of".  The district and prior-notice wording is
  // provenance, not part of either street name.
  const referencedSectionRename = english.match(
    /rename\s+a\s+section\s+of\s+(.+?)\s+in\s+.+?\s+as\s+set\s+out\s+in\s+g\.?\s*n\.?\s*\d+.*?\s+to\s+(.+?)(?:\s+as\s+described|[:.—]|$)/i,
  )
  const rename = directSectionRename ?? referencedSectionRename
  const ceased = english.match(
    /cease\s+a\s+section\s+of\s+(.+?)\s+(?:inside|as\s+set\s+out|to\s+be\s+known|as\s+described|[:.—])/i,
  )
  const actions = [
    rename ? `Rename part of ${rename[1]?.trim()} as ${rename[2]?.trim()}` : null,
    ceased ? `Cease part of ${ceased[1]?.trim()}` : null,
  ].filter((action): action is string => Boolean(action))
  return actions.length > 0 ? actions.join('; ') : null
}

/**
 * Corrigenda are prose rather than table rows. Recognise the legal correction
 * itself, never infer a state change merely from the notice-page label. Both
 * official languages are accepted, with the scope determining the fields that
 * may be changed.
 */
function corrigendumCorrectionFor(
  notice: PairedLandsdStreetNotice,
  parsed: PairedLandsdGovernmentNoticePdfEntry | undefined,
): LandsdStreetTextCorrection | null {
  if (notice.governmentNoticeType !== 'corrigendum' || !parsed) return null
  const english = parseEnglishCorrigendum(parsed.rawExtractedText.en)
  const chinese = parseChineseCorrigendum(parsed.rawExtractedText.zhHant)
  const correction = english ?? chinese
  if (!correction) return null
  if (
    english &&
    chinese &&
    (english.from !== chinese.from || english.to !== chinese.to)
  )
    return null
  return correction
}

function parseEnglishCorrigendum(value: string): LandsdStreetTextCorrection | null {
  const normalised = value.replaceAll(/\s+/g, ' ')
  const character = normalised.match(
    /character\s+[‘'“"]([^’'”"]+)[’'”"]\s+in\s+(?:the\s+)?((?:(?:Chinese|English)\s+)?(?:name|description)(?:\s+and\s+(?:(?:the\s+)?(?:Chinese|English)\s+)?(?:name|description))?|(?:previous\s+)?(?:Government\s+Notice|G\.?N\.?))\s+(?:of\s+[‘'“"][^’'”"]+[’'”"]\s+)?(?:should\s+be\s+)?(?:amended|corrected|changed)\s+to(?:\s+read)?\s+[‘'“"]([^’'”"]+)[’'”"]/i,
  )
  if (character) {
    const scope = character[2] ?? ''
    const fields = correctionFields(
      scope,
      /\bChinese\b/i.test(scope) ||
        (!/\bEnglish\b/i.test(scope) && /\bChinese\s+version\b/i.test(normalised))
        ? 'zh-Hant'
        : 'en',
    )
    const from = character[1]?.trim()
    const to = character[3]?.trim()
    return from && to && fields.length > 0 ? { fields, from, to } : null
  }
  const field = normalised.match(
    /(?:the\s+)?((?:(?:English|Chinese)\s+)?(?:street\s+)?name|(?:(?:English|Chinese)\s+)?description)\s+[‘'“"]([^’'”"]+)[’'”"]\s+in\s+(?:the\s+)?notice\s+should\s+be\s+(?:amended|corrected|changed)\s+to(?:\s+read)?\s+[‘'“"]([^’'”"]+)[’'”"]/i,
  )
  if (!field) return null
  const scope = field[1] ?? ''
  const locale = /\bChinese\b/i.test(scope) ? 'zh-Hant' : 'en'
  const fields = correctionFields(scope, locale)
  const from = field[2]?.trim()
  const to = field[3]?.trim()
  return from && to && fields.length > 0 ? { fields, from, to } : null
}

function parseChineseCorrigendum(value: string): LandsdStreetTextCorrection | null {
  const normalised = value.replaceAll(/\s+/g, ' ')
  const match = normalised.match(
    /(?:名稱|名字).*?(?:說明|描述).*?「[^」]+」中的「([^」]+)」字.*?(?:更正|改正|修正)(?:為|作|成)「([^」]+)」/u,
  )
  const from = match?.[1]?.trim()
  const to = match?.[2]?.trim()
  return from && to
    ? {
        fields: ['zh-Hant.name', 'zh-Hant.description'],
        from,
        to,
      }
    : null
}

function correctionFields(
  scope: string,
  locale: 'en' | 'zh-Hant',
): LandsdStreetCorrectionField[] {
  const fields: LandsdStreetCorrectionField[] = []
  if (/previous\s+(?:government\s+notice|g\.?n\.?)/i.test(scope))
    fields.push('previousNoticeRefs')
  if (/\bname\b/i.test(scope))
    fields.push(`${locale}.name` as LandsdStreetCorrectionField)
  if (/\bdescription\b/i.test(scope))
    fields.push(`${locale}.description` as LandsdStreetCorrectionField)
  return fields
}

function correctedNoticeName(
  name: { en: string; zhHant: string },
  correction: LandsdStreetTextCorrection | null,
) {
  if (!correction) return name
  return {
    en: correction.fields.includes('en.name')
      ? replaceCorrectionText(name.en, correction)
      : name.en,
    zhHant: correction.fields.includes('zh-Hant.name')
      ? replaceCorrectionText(name.zhHant, correction)
      : name.zhHant,
  }
}

function replaceCorrectionText(value: string, correction: LandsdStreetTextCorrection) {
  return value.replaceAll(
    new RegExp(escapeRegularExpression(correction.from), 'giu'),
    correction.to,
  )
}

function escapeRegularExpression(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function parseLandsdStreetCuration(
  value: unknown,
  path: string,
): LandsdStreetCurationManifest {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.decisions))
    throw new Error(
      `${path} must contain a version 2 LandsD street-application manifest.`,
    )
  const seen = new Set<string>()
  const decisions = value.decisions.map((value, index) => {
    if (
      !isRecord(value) ||
      typeof value.sourceRecordId !== 'string' ||
      !value.sourceRecordId.trim()
    )
      throw new Error(`${path}: decision ${index + 1} needs sourceRecordId.`)
    if (seen.has(value.sourceRecordId))
      throw new Error(`${path}: duplicate decision for ${value.sourceRecordId}.`)
    seen.add(value.sourceRecordId)
    if (
      value.disposition !== 'apply' &&
      value.disposition !== 'noOp' &&
      value.disposition !== 'defer'
    )
      throw new Error(`${path}: decision ${index + 1} has invalid disposition.`)
    const string = (field: string) =>
      value[field] === undefined
        ? undefined
        : typeof value[field] === 'string' && value[field].trim()
          ? value[field].trim()
          : fail(`${path}: decision ${index + 1} ${field} must be a non-empty string.`)
    const scope =
      value.nameChangeScope === undefined
        ? undefined
        : value.nameChangeScope === 'whole' || value.nameChangeScope === 'partial'
          ? value.nameChangeScope
          : fail(`${path}: decision ${index + 1} has invalid nameChangeScope.`)
    const retained =
      value.retainedDescriptions === undefined
        ? undefined
        : isRecord(value.retainedDescriptions) &&
            typeof value.retainedDescriptions.en === 'string' &&
            value.retainedDescriptions.en.trim() &&
            typeof value.retainedDescriptions.zhHant === 'string' &&
            value.retainedDescriptions.zhHant.trim()
          ? {
              en: value.retainedDescriptions.en.trim(),
              zhHant: value.retainedDescriptions.zhHant.trim(),
            }
          : fail(
              `${path}: decision ${index + 1} retainedDescriptions needs en and zhHant.`,
            )
    if (scope !== 'partial' && retained)
      throw new Error(`${path}: retainedDescriptions requires partial scope.`)
    return {
      sourceRecordId: value.sourceRecordId.trim(),
      disposition: value.disposition,
      ...(string('affectedStreetId')
        ? { affectedStreetId: string('affectedStreetId') }
        : {}),
      ...(string('createdStreetId')
        ? { createdStreetId: string('createdStreetId') }
        : {}),
      ...(scope ? { nameChangeScope: scope } : {}),
      ...(retained ? { retainedDescriptions: retained } : {}),
    } satisfies LandsdStreetCurationDecision
  })
  return { schemaVersion: 2, decisions }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function fail(message: string): never {
  throw new Error(message)
}
