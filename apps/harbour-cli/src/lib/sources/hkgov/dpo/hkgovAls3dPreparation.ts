import { createWriteStream, globSync } from 'node:fs'
import { once } from 'node:events'
import { basename, resolve } from 'node:path'
import { buildDeterministicUuidV5 } from '@repo/db'
import {
  alsSourcePayload,
  type AlsPublisherSource,
} from '@repo/core/pipeline/services/sources/alsSourcePayload'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type { AlsAuditGuardId } from './hkgovAlsAuditGuards'
import { applyAlsAddressHierarchies } from './hkgovAlsHierarchies'
import { assertYungShingSharedInventory } from './hkgovAlsYungShingSharedBuilding'
import { reviewedComplexInventoryParents } from './hkgovAlsComplexPromotions'
import {
  enrichAls3dParentBlock,
  hkgovAls3dBlocklessParentKey,
  suppressAls3dParentBlockDuplicate,
} from './hkgovAls3dBlockEnrichment'
import { applyAls3dCorrections } from './hkgovAls3dCorrections'
import { resolveAlsCsuCorrection } from './hkgovAlsCsuCorrections'
import { als3dSuppression } from './hkgovAls3dSuppressions'
import { readAls3dWithBackfills } from './hkgovAls3dBackfills'
import { assertStreetEstateAliasInventoryEmpty } from './hkgovAlsStreetEstateComplexes'
import { assertAlsCommercialInventoryAbsent } from './hkgovAlsCommercialRetentions'
import { reportAlsReviewIssue, type AlsReviewIssue } from './hkgovAlsReviewIssue'
import {
  als3dHash,
  assertAddress3dRowBudget,
  normaliseAls3dInventory,
  type Als3dLocale,
} from './hkgovAls3d'

const COLLECTION_NAMESPACE = '72a46f2d-4110-5ce2-b94b-1ed9320ab83e'
const SOURCE_NAMESPACE = 'b1bfe2bf-c40f-5f0b-945f-a390bdd72d03'
export type PreparedAls3dRecord =
  | (AlsPublisherSource & { kind: 'source2d' })
  | {
      kind: 'source'
      sourceRecordId: string
      versionHash: string
      rawProperties: unknown
      sourceGeometry: unknown
      sources: unknown[]
    }
  | ({
      kind: 'collection'
      id: string
      address2dId: string
      unresolvedSectionIds: string[]
      sourceRecordIds: string[]
      processingSources?: Array<Record<string, unknown>>
    } & ReturnType<typeof normaliseAls3dInventory>)
  | {
      kind: 'manifest'
      sourceVersion: string
      collectionCount: number
      unitCount: number
      sourceCount: number
      source2dCount?: number
    }

const value = (input: unknown) => (input == null ? null : String(input).trim() || null)
const cleanBuilding = (input: unknown) =>
  value(input)
    ?.replace(/\s*\([^()]*\)$/, '')
    .trim() ?? null
function parentKey(csu: unknown, en: Als3dLocale, zh: Als3dLocale) {
  return JSON.stringify([
    value(csu),
    value(en.EngEstate?.EstateName),
    value(zh.ChiEstate?.EstateName),
    cleanBuilding(en.BuildingName),
    cleanBuilding(zh.BuildingName),
    value(en.EngBlock?.BlockNo),
    value(en.EngStreet?.StreetName),
    value(en.EngStreet?.BuildingNoFrom),
    value(en.EngStreet?.BuildingNoTo),
  ])
}

/** Write bounded records; retain every source occurrence, deduplicate only reviewed owners. */
export async function prepareAls3dCollections(options: {
  sourceDir: string
  sourceVersion: string
  outputFile: string
  rows: PreparedHkgovAlsRow[]
  publisherSources?: Iterable<AlsPublisherSource>
  aliasOwnerIds?: ReadonlyMap<string, string>
  writeOutput?: boolean
  skipCurationChecks?: boolean
  onGuardPassed?: (id: AlsAuditGuardId, count?: number) => void
}) {
  const input = globSync(
    resolve(options.sourceDir, 'als_addresses_3d_*.geojson'),
  ).sort()
  if (input.length === 0 && options.publisherSources !== undefined) {
    await writeAls2dSourceLedger(options)
    return { collectionCount: 0, unitCount: 0, sourceCount: 0 }
  }
  if (input.length !== 1)
    throw new Error(`Expected one ALS 3D delivery, found ${input.length}`)
  const ownership = applyAlsAddressHierarchies(options.rows, options.sourceVersion)
  const byKey = new Map<string, PreparedHkgovAlsRow[]>()
  const blocklessParentsByKey = new Map<string, PreparedHkgovAlsRow[]>()
  const suppressed2dIds = new Set<string>(
    options.rows
      .filter(row => row.hierarchyCuration === 'long-shin-range-alias')
      .map(row => row.id),
  )
  for (const row of options.rows) {
    if (!row.engPremisesAddressJson || !row.chiPremisesAddressJson) continue
    const en = JSON.parse(row.engPremisesAddressJson)
    const zh = JSON.parse(row.chiPremisesAddressJson)
    const key = parentKey(row.hkgovCsuId, en, zh)
    byKey.set(key, [...(byKey.get(key) ?? []), row])
    if (!en.EngBlock && !zh.ChiBlock && !row.enBlockNumber && !row.zhHantBlockNumber) {
      const blocklessKey = hkgovAls3dBlocklessParentKey(row.hkgovCsuId, en, zh)
      blocklessParentsByKey.set(blocklessKey, [
        ...(blocklessParentsByKey.get(blocklessKey) ?? []),
        row,
      ])
    }
  }
  for (const { csu, en, zh, owner } of reviewedComplexInventoryParents(options.rows)) {
    const key = parentKey(csu, en, zh)
    if (byKey.has(key))
      throw new Error('Reviewed complex inventory parent is ambiguous')
    byKey.set(key, [owner])
  }
  const writer =
    options.writeOutput === false
      ? undefined
      : createWriteStream(`${options.outputFile}.address3d.jsonl`)
  // Observe errors even when the stream has not reached its high-water mark.
  let streamError: Error | undefined
  writer?.on('error', error => {
    streamError = error
  })
  const write = async (record: PreparedAls3dRecord) => {
    if (!writer) return
    if (streamError) throw streamError
    if (!writer.write(`${JSON.stringify(record)}\n`)) await once(writer, 'drain')
  }
  const ownerHashes = new Map<string, string>()
  const physicalOwners = new Map<string, string>()
  const ownerSources = new Map<string, string[]>()
  const ownerProcessingSources = new Map<string, Array<Record<string, unknown>>>()
  let unitCount = 0
  let sourceCount = 0
  let source2dCount = 0
  for (const source of options.publisherSources ?? []) {
    await write({ kind: 'source2d', ...source })
    source2dCount += 1
  }
  const sourceOccurrences = new Map<string, number>()
  const file = input[0]
  if (!file) throw new Error('Missing ALS 3D file')
  try {
    // First pass establishes all source references and checks that repeated
    // physical-building inventories cannot escape into separate collections.
    for await (const {
      feature,
      featureIndexOneBased,
      backfill,
      houseRetention,
    } of readAls3dWithBackfills(file, options.sourceVersion, options.rows)) {
      assertStreetEstateAliasInventoryEmpty(feature, options.sourceVersion)
      assertYungShingSharedInventory(feature, options.sourceVersion)
      assertAlsCommercialInventoryAbsent(feature, options.sourceVersion)
      const p = feature.properties.Address.PremisesAddress
      const en = p.EngPremisesAddress ?? {}
      const zh = p.ChiPremisesAddress ?? {}
      const reportReview = (
        code: AlsReviewIssue['code'],
        candidateAddressIds: string[],
      ) =>
        reportAlsReviewIssue({
          sourceVersion: options.sourceVersion,
          sourceFile: basename(file),
          featureIndexOneBased,
          code,
          estate: en.EngEstate?.EstateName ?? null,
          building: en.BuildingName ?? null,
          csu: p.BuildingCsuInformation?.CsuId ?? null,
          candidateAddressIds,
        })
      const csuCorrection = resolveAlsCsuCorrection(feature, options.sourceVersion)
      const key = parentKey(csuCorrection.csu, en, zh)
      const { corrections } = applyAls3dCorrections(feature, options.sourceVersion)
      const suppression = als3dSuppression(
        feature,
        options.sourceVersion,
        options.skipCurationChecks,
      )
      if (
        !options.skipCurationChecks &&
        (corrections.length ||
          suppression ||
          csuCorrection.decision ||
          backfill ||
          houseRetention)
      )
        options.onGuardPassed?.('inventory-source')
      const processingSources: Array<Record<string, unknown>> = [
        ...(houseRetention
          ? [
              {
                dataset: 'saanseoi-address-house-retention',
                id: houseRetention.id,
                sourceFile: houseRetention.curationFile,
                evidenceSourceVersion: houseRetention.evidenceSourceVersion,
              },
            ]
          : []),
        ...(backfill
          ? [
              {
                dataset: 'saanseoi-address3d-backfill',
                id: backfill.id,
                sourceFile: 'hkgov-dpo-address-3d-backfills.json',
                evidenceSourceVersion: backfill.evidenceSourceVersion,
                featureIndexOneBased: backfill.featureIndexOneBased,
              },
            ]
          : []),
      ]
      const decisions = [
        ...processingSources,
        ...(csuCorrection.decision
          ? [{ dataset: 'saanseoi-address-csu-correction', ...csuCorrection.decision }]
          : []),
        ...(suppression ? [suppression] : []),
        ...corrections.map(correction => ({
          dataset: 'saanseoi-address3d-correction',
          fixtureVersion: 1,
          sourceFile: 'hkgov-dpo-address-3d-corrections.json',
          ...correction,
        })),
      ]
      // Retention may replace or combine current occurrences; a backfill may create
      // an inventory absent from this upload. Only actual uploaded occurrences
      // become publisher rows. Reconstruction evidence belongs to the collection.
      const originals =
        houseRetention?.originalAssertions ??
        (backfill ? [] : [{ feature, featureIndexOneBased }])
      const sourceRecordIds: string[] = []
      for (const original of originals) {
        const native = original.feature.properties.Address.PremisesAddress
        const rawKey = parentKey(
          native.BuildingCsuInformation?.CsuId,
          native.EngPremisesAddress ?? {},
          native.ChiPremisesAddress ?? {},
        )
        const occurrence = (sourceOccurrences.get(rawKey) ?? 0) + 1
        sourceOccurrences.set(rawKey, occurrence)
        const sourceRecordId = buildDeterministicUuidV5(
          SOURCE_NAMESPACE,
          JSON.stringify([rawKey, occurrence]),
        )
        const source = {
          kind: 'source' as const,
          sourceRecordId,
          versionHash: als3dHash(original.feature),
          ...alsSourcePayload(original.feature),
          sources: [
            {
              dataset: 'hkgov-dpo-als-3d',
              sourceFile: basename(file),
              featureIndexOneBased: original.featureIndexOneBased,
              sourceVersion: options.sourceVersion,
            },
            ...decisions,
          ],
        }
        assertAddress3dRowBudget(source)
        options.onGuardPassed?.('inventory-size')
        await write(source)
        sourceRecordIds.push(sourceRecordId)
        sourceCount++
      }
      if (suppression) continue
      if (!(en.Eng3dAddress?.length || zh.Chi3dAddress?.length)) continue
      let candidates = byKey.get(key) ?? []
      const blocklessKey = hkgovAls3dBlocklessParentKey(csuCorrection.csu, en, zh)
      const structuralCandidates = blocklessParentsByKey.get(blocklessKey) ?? []
      const hasBlockComponents = Boolean(en.EngBlock || zh.ChiBlock)
      if (
        hasBlockComponents &&
        structuralCandidates.length > 1 &&
        options.skipCurationChecks
      )
        reportReview(
          'ambiguous-block-parent',
          structuralCandidates.map(row => row.id),
        )
      if (
        hasBlockComponents &&
        structuralCandidates.length > 1 &&
        !options.skipCurationChecks
      ) {
        throw new Error(
          `ALS 3D parent block enrichment requires review: ${en.EngEstate?.EstateName} / ${en.BuildingName}, feature ${featureIndexOneBased}: ${structuralCandidates.length} block-free candidates`,
        )
      }
      const structuralOwner = structuralCandidates[0]
      if (hasBlockComponents && options.skipCurationChecks) {
        // Reference imports retain publisher components and separate assertions.
        if (
          candidates.length === 0 &&
          structuralCandidates.length === 1 &&
          structuralOwner
        ) {
          candidates = [structuralOwner]
          byKey.set(key, candidates)
        }
      } else if (hasBlockComponents && structuralOwner) {
        enrichAls3dParentBlock({
          en,
          hkgovCsuId: p.BuildingCsuInformation?.CsuId ?? null,
          owner: structuralOwner,
          sourceFeatureIndexOneBased: featureIndexOneBased,
          sourceFile: basename(file),
          sourceVersion: options.sourceVersion,
          zh,
        })
        const duplicates = candidates.filter(
          candidate => candidate.id !== structuralOwner.id,
        )
        if (duplicates.length > 1) {
          throw new Error(
            `ALS 3D parent block enrichment requires review: ${en.EngEstate?.EstateName} / ${en.BuildingName}, feature ${featureIndexOneBased}: ${duplicates.length} block-labelled candidates`,
          )
        }
        const duplicate = duplicates[0]
        if (duplicate) {
          suppressAls3dParentBlockDuplicate(structuralOwner, duplicate)
          suppressed2dIds.add(duplicate.id)
        }
        candidates = [structuralOwner]
        byKey.set(key, candidates)
      }
      if (candidates.length !== 1)
        throw new Error(
          `ALS 3D parent review required: ${en.EngEstate?.EstateName} / ${en.BuildingName}, feature ${featureIndexOneBased}: ${candidates.length} candidates`,
        )
      const parent = candidates[0]
      if (!parent) throw new Error('Missing ALS parent')
      options.onGuardPassed?.('inventory-parent')
      if (
        parent.curatedGranularity === 'section' &&
        !ownership.has(parent.id) &&
        options.skipCurationChecks
      )
        reportReview('unreviewed-section-inventory', [parent.id])
      if (
        parent.curatedGranularity === 'section' &&
        !ownership.has(parent.id) &&
        !options.skipCurationChecks
      )
        throw new Error(`ALS 3D section inventory requires review: ${parent.id}`)
      if (parent.curatedGranularity === 'section' && !options.skipCurationChecks)
        options.onGuardPassed?.('section-ownership')
      const owner =
        options.aliasOwnerIds?.get(parent.id) ??
        ownership.get(parent.id)?.ownerId ??
        parent.id
      const physicalKey = JSON.stringify([
        csuCorrection.csu,
        en.EngEstate?.EstateName,
        en.BuildingName,
        en.EngBlock?.BlockNo,
      ])
      const priorOwner = physicalOwners.get(physicalKey)
      if (priorOwner && priorOwner !== owner && options.skipCurationChecks)
        reportReview('shared-building-owners', [priorOwner, owner])
      if (priorOwner && priorOwner !== owner && !options.skipCurationChecks)
        throw new Error(
          `ALS 3D shared building requires curation: ${en.EngEstate?.EstateName} / ${en.BuildingName}`,
        )
      physicalOwners.set(physicalKey, owner)
      if (priorOwner && !options.skipCurationChecks)
        options.onGuardPassed?.('shared-inventory-owner')
      ownerSources.set(owner, [...(ownerSources.get(owner) ?? []), ...sourceRecordIds])
      if (processingSources.length)
        ownerProcessingSources.set(owner, [
          ...(ownerProcessingSources.get(owner) ?? []),
          ...processingSources,
        ])
    }
    for await (const { feature } of readAls3dWithBackfills(
      file,
      options.sourceVersion,
      options.rows,
    )) {
      if (als3dSuppression(feature, options.sourceVersion, options.skipCurationChecks))
        continue
      const p = feature.properties.Address.PremisesAddress
      if (
        !(
          p.EngPremisesAddress?.Eng3dAddress?.length ||
          p.ChiPremisesAddress?.Chi3dAddress?.length
        )
      )
        continue
      const key = parentKey(
        resolveAlsCsuCorrection(feature, options.sourceVersion).csu,
        p.EngPremisesAddress ?? {},
        p.ChiPremisesAddress ?? {},
      )
      const parent = byKey.get(key)?.[0]
      if (!parent) throw new Error('Parent disappeared between ALS passes')
      const mapping = ownership.get(parent.id)
      const address2dId =
        options.aliasOwnerIds?.get(parent.id) ?? mapping?.ownerId ?? parent.id
      const inventory = normaliseAls3dInventory(
        applyAls3dCorrections(feature, options.sourceVersion).feature,
        options.aliasOwnerIds?.get(parent.id) ??
          mapping?.physicalBuildingId ??
          parent.canonicalId,
      )
      const existing = ownerHashes.get(address2dId)
      if (existing && existing !== inventory.contentHash)
        throw new Error(`ALS 3D conflicting inventories at ${address2dId}`)
      if (existing) options.onGuardPassed?.('inventory-agreement')
      if (existing) continue
      const record: PreparedAls3dRecord = {
        kind: 'collection',
        id: buildDeterministicUuidV5(COLLECTION_NAMESPACE, address2dId),
        address2dId,
        unresolvedSectionIds: mapping?.unresolvedSectionIds ?? [],
        sourceRecordIds: [...new Set(ownerSources.get(address2dId))].sort(),
        ...(ownerProcessingSources.has(address2dId)
          ? { processingSources: ownerProcessingSources.get(address2dId) }
          : {}),
        ...inventory,
      }
      assertAddress3dRowBudget({ ...record, locales: undefined })
      for (const [locale, units] of Object.entries(inventory.locales))
        assertAddress3dRowBudget({ address3dId: record.id, locale, units })
      await write(record)
      ownerHashes.set(address2dId, inventory.contentHash)
      unitCount += inventory.unitCount
    }
    await write({
      kind: 'manifest',
      sourceVersion: options.sourceVersion,
      collectionCount: ownerHashes.size,
      unitCount,
      sourceCount,
      source2dCount,
    })
    if (writer) {
      writer.end()
      await once(writer, 'finish')
    }
    if (suppressed2dIds.size) {
      options.rows.splice(
        0,
        options.rows.length,
        ...options.rows.filter(row => !suppressed2dIds.has(row.id)),
      )
    }
  } finally {
    writer?.destroy()
  }
  return { collectionCount: ownerHashes.size, unitCount, sourceCount }
}

/** Retain the complete publisher ledger even when the release has no 3D delivery. */
async function writeAls2dSourceLedger(options: {
  outputFile: string
  sourceVersion: string
  publisherSources?: Iterable<AlsPublisherSource>
  writeOutput?: boolean
}) {
  if (options.writeOutput === false) return
  const writer = createWriteStream(`${options.outputFile}.address3d.jsonl`)
  let streamError: Error | undefined
  writer.on('error', error => {
    streamError = error
  })
  const write = async (record: PreparedAls3dRecord) => {
    if (streamError) throw streamError
    if (!writer.write(`${JSON.stringify(record)}\n`)) await once(writer, 'drain')
  }
  try {
    let source2dCount = 0
    for (const source of options.publisherSources ?? []) {
      await write({ kind: 'source2d', ...source })
      source2dCount++
    }
    await write({
      kind: 'manifest',
      sourceVersion: options.sourceVersion,
      source2dCount,
      sourceCount: 0,
      collectionCount: 0,
      unitCount: 0,
    })
    writer.end()
    await once(writer, 'finish')
  } finally {
    writer.destroy()
  }
}
