export type HkgovAlsPremiseStructure = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
  normalization: 'none' | 'redundant-building-name' | 'embedded-block'
}

/**
 * Prefer the English canonical component whenever ALS supplied an English source
 * component. This prevents a deliberately removed duplicate English building name
 * from being replaced by a different Chinese building-name representation.
 */
export function preferHkgovAlsEnglishCanonicalValue(input: {
  canonicalEnglish: string | null
  canonicalChinese: string | null
  rawEnglish: string | null
}) {
  return clean(input.rawEnglish) ? input.canonicalEnglish : input.canonicalChinese
}

/**
 * Normalise the narrowly-defined ALS convention where an estate's block, house or
 * tower has been put in BuildingName rather than the structured block fields.
 *
 * This deliberately requires an exact estate prefix and a single trailing token.
 * A free-form building name (for example "WEST GATE TOWER") is never parsed.
 */
export function normalizeHkgovAlsPremiseStructure(input: {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
}): HkgovAlsPremiseStructure {
  const buildingName = clean(input.buildingName)
  const estateName = clean(input.estateName)
  const blockDescriptor = canonicalBlockDescriptor(clean(input.blockDescriptor))
  const blockNumber = clean(input.blockNumber)

  if (!buildingName || !estateName) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
    }
  }

  if (sameName(buildingName, estateName)) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName: null,
      estateName,
      normalization: 'redundant-building-name',
    }
  }

  const escapedEstate = escapeRegExp(estateName).replace(/\\ /g, '\\s+')
  const match = new RegExp(
    `^${escapedEstate}\\s+(BLOCK|BLK|HOUSE|TOWER)\\s+([A-Z0-9][A-Z0-9 ./-]*)$`,
    'i',
  ).exec(buildingName)
  if (!match) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
    }
  }

  const parsedDescriptor = canonicalBlockDescriptor(match[1] ?? null)
  const parsedNumber = clean(match[2] ?? null)
  if (!parsedDescriptor || !parsedNumber) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
    }
  }

  // Never overwrite a disagreeing structured value. It is a source conflict which
  // needs review rather than a presentation normalisation.
  if (
    (blockDescriptor && blockDescriptor !== parsedDescriptor) ||
    (blockNumber && !sameName(blockNumber, parsedNumber))
  ) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
    }
  }

  return {
    blockDescriptor: parsedDescriptor,
    blockNumber: parsedNumber,
    buildingName: null,
    estateName,
    normalization: 'embedded-block',
  }
}

function canonicalBlockDescriptor(value: string | null) {
  if (!value) return null
  const key = value.toUpperCase().replace(/\.$/, '')
  if (key === 'BLOCK' || key === 'BLK') return 'BLK'
  if (key === 'HOUSE') return 'HOUSE'
  if (key === 'TOWER') return 'TOWER'
  return value
}

function clean(value: string | null) {
  const text = value?.trim().replace(/\s+/g, ' ')
  return text || null
}

function sameName(left: string, right: string) {
  return left.toUpperCase() === right.toUpperCase()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
