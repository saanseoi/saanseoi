import type { Als3dLocale } from './hkgovAls3d.ts'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation.ts'
import type {
  HkgovLocalisedPremisesAddress,
  PreparedHkgovAlsRow,
} from './hkgovAlsTypes.ts'

const text = (value: unknown) => {
  if (value == null) return null
  const result = String(value).trim()
  return result || null
}

export type HkgovAls3dParentBlockEnrichment = {
  hkgovCsuId: string
  enBlock: { descriptor: string; ref: string }
  suppressed2dSources: Array<{
    addressId: string
    premises: {
      en: HkgovLocalisedPremisesAddress
      zhHant: HkgovLocalisedPremisesAddress
    }
    source: { featureIndexOneBased: number; file: string }
    sources: unknown
  }>
  zhHantBlock: { descriptor: string; ref: string }
  sourceFeatureIndexOneBased: number
  sourceFile: string
  sourceVersion: string
}

/**
 * A deliberately exact, block-free parent identity. It admits only the 2D/3D
 * representation difference we can express in the public Address2D schema.
 */
export function hkgovAls3dBlocklessParentKey(
  csu: unknown,
  en: Als3dLocale | HkgovLocalisedPremisesAddress,
  zh: Als3dLocale | HkgovLocalisedPremisesAddress,
) {
  return JSON.stringify([
    text(csu),
    text(en.EngEstate?.EstateName),
    text(zh.ChiEstate?.EstateName),
    text(en.BuildingName),
    text(zh.BuildingName),
    text(en.EngStreet?.StreetName),
    text(en.EngStreet?.BuildingNoFrom),
    text(en.EngStreet?.BuildingNoTo),
    text(zh.ChiStreet?.StreetName),
    text(zh.ChiStreet?.BuildingNoFrom),
    text(zh.ChiStreet?.BuildingNoTo),
  ])
}

/**
 * Adds a verified 3D parent block component to its unique, otherwise identical
 * 2D parent. The raw 2D assertion and the exact 3D source location remain in
 * provenance; no second Address2D record or alias is created.
 */
export function enrichAls3dParentBlock(input: {
  en: Als3dLocale
  hkgovCsuId: string | null
  owner: PreparedHkgovAlsRow
  sourceFeatureIndexOneBased: number
  sourceFile: string
  sourceVersion: string
  zh: Als3dLocale
}): HkgovAls3dParentBlockEnrichment {
  const { en, owner, zh } = input
  const enDescriptor = text(en.EngBlock?.BlockDescriptor)
  const enRef = text(en.EngBlock?.BlockNo)
  const zhDescriptor = text(zh.ChiBlock?.BlockDescriptor)
  const zhRef = text(zh.ChiBlock?.BlockNo)
  const existing = owner.als3dParentBlockEnrichment
  if (existing) {
    if (
      existing.enBlock.descriptor === enDescriptor &&
      existing.enBlock.ref === enRef &&
      existing.zhHantBlock.descriptor === zhDescriptor &&
      existing.zhHantBlock.ref === zhRef
    )
      return existing
    throw new Error(
      `ALS 3D parent block enrichment found conflicting block components at ${input.sourceFile} #${input.sourceFeatureIndexOneBased}.`,
    )
  }
  if (
    enDescriptor !== 'BLK' ||
    zhDescriptor !== '座' ||
    !enRef ||
    !zhRef ||
    enRef !== zhRef
  ) {
    throw new Error(
      `ALS 3D parent block enrichment requires matching BLK/座 references at ${input.sourceFile} #${input.sourceFeatureIndexOneBased}.`,
    )
  }
  if (
    !input.hkgovCsuId ||
    owner.hkgovCsuId !== input.hkgovCsuId ||
    owner.enBlockNumber ||
    owner.zhHantBlockNumber
  ) {
    throw new Error(
      `ALS 3D parent block enrichment requires one block-free 2D parent at ${input.sourceFile} #${input.sourceFeatureIndexOneBased}.`,
    )
  }
  if (!owner.engPremisesAddressJson || !owner.chiPremisesAddressJson) {
    throw new Error(`ALS 3D parent block enrichment is missing raw 2D premises.`)
  }
  const ownerEn = JSON.parse(
    owner.engPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  const ownerZh = JSON.parse(
    owner.chiPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  if (
    ownerEn.EngBlock ||
    ownerZh.ChiBlock ||
    hkgovAls3dBlocklessParentKey(owner.hkgovCsuId, ownerEn, ownerZh) !==
      hkgovAls3dBlocklessParentKey(input.hkgovCsuId, en, zh)
  ) {
    throw new Error(
      `ALS 3D parent block enrichment found changed 2D components at ${input.sourceFile} #${input.sourceFeatureIndexOneBased}.`,
    )
  }

  ownerEn.EngBlock = {
    BlockDescriptor: enDescriptor,
    BlockDescriptorPrecedenceIndicator: text(
      en.EngBlock?.BlockDescriptorPrecedenceIndicator,
    ),
    BlockNo: enRef,
  }
  ownerZh.ChiBlock = { BlockDescriptor: zhDescriptor, BlockNo: zhRef }
  owner.engPremisesAddressJson = JSON.stringify(ownerEn)
  owner.chiPremisesAddressJson = JSON.stringify(ownerZh)
  owner.enBlockDescriptor = enDescriptor
  owner.enBlockNumber = enRef
  owner.zhHantBlockDescriptor = zhDescriptor
  owner.zhHantBlockNumber = zhRef
  owner.enFormattedAddress = formatEnPremisesAddress(ownerEn)
  owner.zhHantFormattedAddress = formatZhPremisesAddress(ownerZh)

  const enrichment: HkgovAls3dParentBlockEnrichment = {
    enBlock: { descriptor: enDescriptor, ref: enRef },
    hkgovCsuId: input.hkgovCsuId,
    suppressed2dSources: [],
    sourceFeatureIndexOneBased: input.sourceFeatureIndexOneBased,
    sourceFile: input.sourceFile,
    sourceVersion: input.sourceVersion,
    zhHantBlock: { descriptor: zhDescriptor, ref: zhRef },
  }
  owner.als3dParentBlockEnrichment = enrichment
  writeEnrichmentProvenance(owner)
  return enrichment
}

/** Suppress only a 2D variant that differs solely by the verified block expression. */
export function suppressAls3dParentBlockDuplicate(
  owner: PreparedHkgovAlsRow,
  duplicate: PreparedHkgovAlsRow,
) {
  const enrichment = owner.als3dParentBlockEnrichment
  if (!enrichment || duplicate.id === owner.id) {
    throw new Error('ALS 3D parent block duplicate has no enriched canonical owner.')
  }
  if (
    owner.geometry !== duplicate.geometry ||
    owner.hkgovCsuId !== duplicate.hkgovCsuId ||
    duplicate.enBlockDescriptor !== enrichment.enBlock.descriptor ||
    duplicate.enBlockNumber !== enrichment.enBlock.ref ||
    duplicate.zhHantBlockDescriptor !== enrichment.zhHantBlock.descriptor ||
    duplicate.zhHantBlockNumber !== enrichment.zhHantBlock.ref ||
    !owner.engPremisesAddressJson ||
    !owner.chiPremisesAddressJson ||
    !duplicate.engPremisesAddressJson ||
    !duplicate.chiPremisesAddressJson
  ) {
    throw new Error('ALS 3D parent block duplicate changed; review required.')
  }
  const ownerEn = JSON.parse(
    owner.engPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  const ownerZh = JSON.parse(
    owner.chiPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  const duplicateEn = JSON.parse(
    duplicate.engPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  const duplicateZh = JSON.parse(
    duplicate.chiPremisesAddressJson,
  ) as HkgovLocalisedPremisesAddress
  if (
    !isBlockNameVariant(
      ownerEn.BuildingName,
      duplicateEn.BuildingName,
      enrichment.enBlock,
      'en',
    ) ||
    !isBlockNameVariant(
      ownerZh.BuildingName,
      duplicateZh.BuildingName,
      enrichment.zhHantBlock,
      'zh-hant',
    )
  ) {
    throw new Error(
      'ALS 3D parent block duplicate changed building name; review required.',
    )
  }
  delete ownerEn.EngBlock
  delete ownerZh.ChiBlock
  duplicateEn.BuildingName = ownerEn.BuildingName
  duplicateZh.BuildingName = ownerZh.BuildingName
  delete duplicateEn.EngBlock
  delete duplicateZh.ChiBlock
  if (
    canonical(ownerEn) !== canonical(duplicateEn) ||
    canonical(ownerZh) !== canonical(duplicateZh)
  ) {
    throw new Error(
      'ALS 3D parent block duplicate changed components; review required.',
    )
  }
  enrichment.suppressed2dSources.push({
    addressId: duplicate.id,
    premises: {
      en: JSON.parse(duplicate.engPremisesAddressJson),
      zhHant: JSON.parse(duplicate.chiPremisesAddressJson),
    },
    source: {
      featureIndexOneBased: duplicate.sourceFeatureIndexOneBased,
      file: duplicate.sourceFile,
    },
    sources: JSON.parse(duplicate.sources),
  })
  writeEnrichmentProvenance(owner)
}

function writeEnrichmentProvenance(owner: PreparedHkgovAlsRow) {
  const sources = JSON.parse(owner.sources) as Record<string, unknown>
  owner.sources = JSON.stringify({
    ...sources,
    hkgovAls3dParentBlockEnrichment: owner.als3dParentBlockEnrichment,
  })
}

function isBlockNameVariant(
  ownerName: string | null | undefined,
  variantName: string | null | undefined,
  block: { descriptor: string; ref: string },
  locale: 'en' | 'zh-hant',
) {
  const owner = text(ownerName)
  const variant = text(variantName)
  if (!owner || !variant) return false
  if (owner === variant) return true
  const parentheses = locale === 'en' ? ['(', ')'] : ['(', ')', '（', '）']
  const expressions =
    locale === 'en'
      ? [`${owner} (${block.descriptor} ${block.ref})`]
      : parentheses.flatMap((open, index) =>
          index % 2 === 0
            ? [
                `${owner}${open}${block.ref}${block.descriptor}${parentheses[index + 1]}`,
              ]
            : [],
        )
  return expressions.includes(variant)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
