import type { CurrentFieldRule } from './fieldLineageCurrentRules'

const implementation = {
  path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation.ts',
  symbol: 'normalisePreparedDivision',
}

/** Planning has its own materialiser; it does not execute Overture taxonomy or names. */
export function planningDivisionFieldRule(field: string): CurrentFieldRule | null {
  const contracts: Record<string, [string, string[]]> = {
    id: ['requireString(value.id, "id")', ['id']],
    level: [
      'levelNumber(value.planning_level): newtown/ppu = 3, spu = 4, tpu = 5, subunit = 6; reject any other level.',
      ['planning_level'],
    ],
    class: [
      '"planning-" + requireString(value.planning_level, "planning_level")',
      ['planning_level'],
    ],
    category: ['null', []],
    cartography: ['null', []],
    geometry: [
      'parseWkbGeometry(value.geometry); reject absent or invalid geometry.',
      ['geometry'],
    ],
    bbox: ['calculateGeoJsonBbox(parseWkbGeometry(value.geometry))', ['geometry']],
    identifiers: ['asRecord(value.identifiers)', ['identifiers']],
    sources: ['{ evidence: [{ record_id: requireString(value.id, "id") }] }', ['id']],
    divisionCode: [
      'value.planning_level === "newtown" ? divisionCodesByCanonicalId.get(id) ?? null : null',
      ['planning_level', 'id', 'divisionCodesByCanonicalId'],
    ],
    hierarchies: [
      'For each hierarchy entry, join division_id to the complete prepared Division set; require the ancestor, use its class and resolved locale names, and materialiseDivisionHierarchies(id, [path]).',
      ['id', 'hierarchy', 'translatedPlanningDivisions'],
    ],
  }
  const locale = /^i18n\.([^.]+)\.name$/.exec(field)
  if (locale)
    return {
      implementation: { ...implementation, symbol: 'readPreparedDivisionsInternal' },
      expression: `Select locale ${JSON.stringify(locale[1])} from resolveSourceReleaseNameTranslationsBatch(record.i18n).`,
      inputs: ['id', 'i18n', 'sourceReleaseCode', 'sourceReleaseTranslations'],
      steps: [
        'normaliseI18n accepts only array members with string locale and string name.',
        'Complete required English and Traditional Chinese locales from the source-release translation fixture; preserve supplied locales.',
        'Match translations by record ID, source locale and source-text hash. Require a resolved localisation result before materialising the record.',
      ],
      additionalImplementations: [
        {
          path: 'apps/harbour-cli/src/lib/i18n/sourceReleaseTranslations.ts',
          symbol: 'resolveSourceReleaseNameTranslationsBatch',
        },
      ],
    }
  const contract = contracts[field]
  if (!contract) return null
  return {
    implementation: {
      ...implementation,
      symbol:
        field === 'hierarchies'
          ? 'readPreparedDivisionsInternal'
          : implementation.symbol,
    },
    expression: contract[0],
    inputs: contract[1],
    additionalImplementations: [
      {
        path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadRows.ts',
        symbol: 'levelNumber',
      },
    ],
  }
}
