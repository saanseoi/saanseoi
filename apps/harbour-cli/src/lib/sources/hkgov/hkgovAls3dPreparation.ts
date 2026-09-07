import { createWriteStream, globSync } from 'node:fs'
import { once } from 'node:events'
import { basename, resolve } from 'node:path'
import { buildDeterministicUuidV5 } from '@repo/db'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { applyAlsAddressHierarchies } from './hkgovAlsHierarchies'
import {
  enrichAls3dParentBlock,
  hkgovAls3dBlocklessParentKey,
  suppressAls3dParentBlockDuplicate,
} from './hkgovAls3dBlockEnrichment'
import { applyAls3dCorrections } from './hkgovAls3dCorrections'
import { readAls3dWithBackfills } from './hkgovAls3dBackfills'
import {
  als3dHash,
  assertAddress3dRowBudget,
  normaliseAls3dInventory,
  type Als3dLocale,
} from './hkgovAls3d'

const COLLECTION_NAMESPACE = '72a46f2d-4110-5ce2-b94b-1ed9320ab83e'
const SOURCE_NAMESPACE = 'b1bfe2bf-c40f-5f0b-945f-a390bdd72d03'
export type PreparedAls3dRecord =
  | {
      kind: 'source'
      sourceRecordId: string
      versionHash: string
      rawProperties: unknown
      sources: unknown[]
    }
  | ({
      kind: 'collection'
      id: string
      address2dId: string
      unresolvedSectionIds: string[]
      sourceRecordIds: string[]
    } & ReturnType<typeof normaliseAls3dInventory>)
  | {
      kind: 'manifest'
      sourceVersion: string
      collectionCount: number
      unitCount: number
      sourceCount: number
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
  aliasOwnerIds?: ReadonlyMap<string, string>
  writeOutput?: boolean
  skipCurationChecks?: boolean
}) {
  const input = globSync(
    resolve(options.sourceDir, 'als_addresses_3d_*.geojson'),
  ).sort()
  if (input.length !== 1)
    throw new Error(`Expected one ALS 3D delivery, found ${input.length}`)
  const ownership = applyAlsAddressHierarchies(options.rows, options.sourceVersion)
  const byKey = new Map<string, PreparedHkgovAlsRow[]>()
  const blocklessParentsByKey = new Map<string, PreparedHkgovAlsRow[]>()
  const suppressed2dIds = new Set<string>()
  for (const row of options.rows) {
    if (!row.engPremisesAddressJson || !row.chiPremisesAddressJson) continue
    const en = JSON.parse(row.engPremisesAddressJson)
    const zh = JSON.parse(row.chiPremisesAddressJson)
    const key = parentKey(row.hkgovCsuId, en, zh)
    byKey.set(key, [...(byKey.get(key) ?? []), row])
    if (!row.enBlockNumber && !row.zhHantBlockNumber) {
      const blocklessKey = hkgovAls3dBlocklessParentKey(row.hkgovCsuId, en, zh)
      blocklessParentsByKey.set(blocklessKey, [
        ...(blocklessParentsByKey.get(blocklessKey) ?? []),
        row,
      ])
    }
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
  let unitCount = 0
  let sourceCount = 0
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
    } of readAls3dWithBackfills(file, options.sourceVersion, options.rows)) {
      const p = feature.properties.Address.PremisesAddress
      const en = p.EngPremisesAddress ?? {}
      const zh = p.ChiPremisesAddress ?? {}
      const key = parentKey(p.BuildingCsuInformation?.CsuId, en, zh)
      const occurrence = (sourceOccurrences.get(key) ?? 0) + 1
      sourceOccurrences.set(key, occurrence)
      const sourceRecordId = buildDeterministicUuidV5(
        SOURCE_NAMESPACE,
        JSON.stringify(backfill ? [key, occurrence, backfill.id] : [key, occurrence]),
      )
      const { corrections } = applyAls3dCorrections(feature, options.sourceVersion)
      const source = {
        kind: 'source' as const,
        sourceRecordId,
        versionHash: als3dHash(
          backfill
            ? { feature, backfill }
            : corrections.length
              ? { feature, corrections }
              : feature,
        ),
        rawProperties: feature,
        sources: [
          {
            dataset: 'hkgov-dpo-als-3d',
            sourceFile: basename(file),
            featureIndexOneBased,
            sourceVersion: backfill?.evidenceSourceVersion ?? options.sourceVersion,
          },
          ...(backfill
            ? [
                {
                  dataset: 'saanseoi-address3d-backfill',
                  sourceFile: 'hkgov-dpo-address-3d-backfills.json',
                  ...backfill,
                },
              ]
            : []),
          ...corrections.map(correction => ({
            dataset: 'saanseoi-address3d-correction',
            fixtureVersion: 1,
            sourceFile: 'hkgov-dpo-address-3d-corrections.json',
            ...correction,
          })),
        ],
      }
      assertAddress3dRowBudget(source)
      await write(source)
      sourceCount++
      if (!(en.Eng3dAddress?.length || zh.Chi3dAddress?.length)) continue
      let candidates = byKey.get(key) ?? []
      const blocklessKey = hkgovAls3dBlocklessParentKey(
        p.BuildingCsuInformation?.CsuId,
        en,
        zh,
      )
      const structuralCandidates = blocklessParentsByKey.get(blocklessKey) ?? []
      const hasBlockComponents = Boolean(en.EngBlock || zh.ChiBlock)
      if (hasBlockComponents && structuralCandidates.length > 1) {
        throw new Error(
          `ALS 3D parent block enrichment requires review: ${en.EngEstate?.EstateName} / ${en.BuildingName}, feature ${featureIndexOneBased}: ${structuralCandidates.length} block-free candidates`,
        )
      }
      const structuralOwner = structuralCandidates[0]
      if (hasBlockComponents && structuralOwner) {
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
      if (parent.curatedGranularity === 'section' && !ownership.has(parent.id))
        throw new Error(`ALS 3D section inventory requires review: ${parent.id}`)
      const owner =
        options.aliasOwnerIds?.get(parent.id) ??
        ownership.get(parent.id)?.ownerId ??
        parent.id
      const physicalKey = JSON.stringify([
        p.BuildingCsuInformation?.CsuId,
        en.EngEstate?.EstateName,
        en.BuildingName,
        en.EngBlock?.BlockNo,
      ])
      const priorOwner = physicalOwners.get(physicalKey)
      if (priorOwner && priorOwner !== owner && !options.skipCurationChecks)
        throw new Error(
          `ALS 3D shared building requires curation: ${en.EngEstate?.EstateName} / ${en.BuildingName}`,
        )
      physicalOwners.set(physicalKey, owner)
      ownerSources.set(owner, [...(ownerSources.get(owner) ?? []), sourceRecordId])
    }
    for await (const { feature } of readAls3dWithBackfills(
      file,
      options.sourceVersion,
      options.rows,
    )) {
      const p = feature.properties.Address.PremisesAddress
      if (
        !(
          p.EngPremisesAddress?.Eng3dAddress?.length ||
          p.ChiPremisesAddress?.Chi3dAddress?.length
        )
      )
        continue
      const key = parentKey(
        p.BuildingCsuInformation?.CsuId,
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
      if (existing) continue
      const record: PreparedAls3dRecord = {
        kind: 'collection',
        id: buildDeterministicUuidV5(COLLECTION_NAMESPACE, address2dId),
        address2dId,
        unresolvedSectionIds: mapping?.unresolvedSectionIds ?? [],
        sourceRecordIds: [...new Set(ownerSources.get(address2dId))].sort(),
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
