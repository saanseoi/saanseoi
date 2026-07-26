import { isCancel, select, text } from '@clack/prompts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type {
  PairedLandsdGovernmentNoticePdfEntry,
  PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import { mintLandsdStreetId } from './landsdStreetIds.ts'

export type LandsdStreetCurationDisposition = 'apply' | 'defer' | 'noOp'
export type LandsdStreetCurationDecision = {
  affectedStreetId?: string
  createdStreetId?: string
  disposition: LandsdStreetCurationDisposition
  nameChangeScope?: 'whole' | 'partial'
  retainedDescriptions?: { en: string; zhHant: string }
  sourceRecordId: string
}
export type LandsdStreetCurationManifest = {
  decisions: LandsdStreetCurationDecision[]
  schemaVersion: 2
}
export type LandsdStreetLifecycleReview = {
  curation: LandsdStreetCurationDecision | null
  governmentNoticeType: 'change' | 'corrigendum' | 'intention'
  governmentNoticeUrls: { en: string | null; zhHant: string | null }
  name: { en: string; zhHant: string }
  noticeIdentity: string | null
  parsedPreviousNoticeRefs: string[]
  publicationDate: string
  sourceRecordId: string
}
export type LandsdStreetAppliedCuration = {
  affectedStreetId: string | null
  createdStreetId: string | null
  disposition: 'apply' | 'noOp'
  method: 'manual'
  nameChangeScope: 'whole' | 'partial' | null
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
    const disposition = await select({
      message: `${item.governmentNoticeType}: ${item.name.en} / ${item.name.zhHant}`,
      options: [
        { value: 'apply' as const, label: 'Apply a reviewed street change' },
        { value: 'noOp' as const, label: 'Record as no material street-state change' },
        { value: 'defer' as const, label: 'Defer and block this snapshot' },
      ],
    })
    if (isCancel(disposition)) throw new Error('LandsD lifecycle review cancelled.')
    let affectedStreetId: string | undefined
    let createdStreetId: string | undefined
    let nameChangeScope: 'whole' | 'partial' | undefined
    let retainedDescriptions: { en: string; zhHant: string } | undefined
    if (disposition === 'apply') {
      const affected = await text({
        message: 'Affected canonical street ID',
        validate: value =>
          (value ?? '').trim() ? undefined : 'Enter the reviewed canonical street ID.',
      })
      if (isCancel(affected)) throw new Error('LandsD lifecycle review cancelled.')
      affectedStreetId = (affected ?? '').trim()
      if (item.governmentNoticeType === 'change') {
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
  manifest: LandsdStreetCurationManifest
  notices: PairedLandsdStreetNotice[]
  parsedEntries: ReadonlyMap<string, PairedLandsdGovernmentNoticePdfEntry>
}) {
  const reviewable = input.notices.filter(
    (
      notice,
    ): notice is PairedLandsdStreetNotice & {
      governmentNoticeType: 'change' | 'corrigendum' | 'intention'
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
  const review = reviewable.map(
    notice =>
      ({
        curation: decisions.get(notice.id) ?? null,
        governmentNoticeType: notice.governmentNoticeType,
        governmentNoticeUrls: {
          en: notice.governmentNotices.en?.url ?? null,
          zhHant: notice.governmentNotices.zhHant?.url ?? null,
        },
        name: notice.names,
        noticeIdentity: notice.noticeIdentity,
        parsedPreviousNoticeRefs:
          input.parsedEntries.get(notice.id)?.previousNoticeRefs ?? [],
        publicationDate: notice.publicationDate,
        sourceRecordId: notice.id,
      }) satisfies LandsdStreetLifecycleReview,
  )
  const unresolved = review.filter(
    item =>
      !item.curation ||
      item.curation.disposition === 'defer' ||
      (item.curation.disposition === 'apply' && !item.curation.affectedStreetId),
  )
  const applied = new Map<string, LandsdStreetAppliedCuration>()
  for (const item of review) {
    const decision = item.curation
    if (!decision || decision.disposition === 'defer') continue
    if (
      decision.disposition === 'apply' &&
      item.governmentNoticeType === 'change' &&
      !decision.createdStreetId
    )
      throw new Error(
        `LandsD name change ${decision.sourceRecordId} requires createdStreetId.`,
      )
    applied.set(item.sourceRecordId, {
      affectedStreetId: decision.affectedStreetId ?? null,
      createdStreetId: decision.createdStreetId ?? null,
      disposition: decision.disposition,
      method: 'manual',
      nameChangeScope: decision.nameChangeScope ?? null,
      retainedDescriptions: decision.retainedDescriptions ?? null,
    })
  }
  return { applied, review, unresolved }
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
