import { geographicDivisionClassification } from '@repo/db'
import {
  createDivisionBranchCounts,
  divisionNormalisationRule,
  normaliseDivisionRow,
} from '@repo/core/pipeline/services/divisions/division'
import {
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
} from '@repo/core/pipeline/services/divisions/overtureHongKongAreas'
import {
  createBranchCounts,
  type AuditGuard,
  type BranchCounts,
  type RuleBranch,
  type RuleDeclaration,
} from '@repo/core/provenance'
import type { PreparationEvidence } from './preparationAudit'

type Row = Record<string, any>
export type PreparationRuleEvidence = {
  declaration: RuleDeclaration
  branches: BranchCounts
  normalised: number
  hierarchyAssigned: number
  guards: AuditGuard[]
}
const locales = ['en', 'zh-hant', 'zh-hans']
const localeBranches: RuleBranch[] = locales.flatMap(locale => [
  {
    id: `prepared-locale.${locale}.present`,
    group: `Locale Normalisation: ${locale}`,
    precedence: 1,
    condition: { field: locale, equals: true },
    result: locale,
  },
  {
    id: `prepared-locale.${locale}.absent`,
    group: `Locale Normalisation: ${locale}`,
    precedence: 2,
    condition: { all: [] },
    result: 'missing',
  },
])
export const preparationRulesDeclaration: RuleDeclaration = {
  ...divisionNormalisationRule.declaration,
  id: 'prepare-curated-division-rules',
  summary:
    'Normalise Overture ingredients for comparison with the reviewed edition, and reconcile its prepared locales.',
  inputs: ['overture-divisions'],
  outputs: ['prepared-divisions'],
  parameters: {
    ...divisionNormalisationRule.declaration.parameters,
    branchCountSemantics:
      'Classification and inference count Overture normalisation for identities retained in this edition, before final editorial overrides. Locale counts compare the final edition against the retained normalised ingredient names; changed includes additions, replacements and removals.',
    localeNormalisationSummary:
      'Keep the edition’s reviewed names for each language. Matched counts prepared divisions with or without a name; Changed counts names added, replaced or removed compared with the normalised ingredient. Simplified Chinese requires explicit publisher evidence.',
  },
  branches: [
    ...divisionNormalisationRule.declaration.branches!.filter(
      branch => !branch.id.startsWith('locale.'),
    ),
    ...localeBranches,
  ],
  implementation: {
    path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/preparationRules.ts',
    symbol: 'finishPreparationRules',
  },
  dependencies: [divisionNormalisationRule.declaration],
}

/** Count the executed ingredient normalisation used by preparation’s before/after comparison. */
export function normaliseAuditedIngredient(
  row: Row,
  counts: Map<string, BranchCounts>,
) {
  const branches = createDivisionBranchCounts()
  // This pass counts field/name normalisation without resolving ancestor records.
  // Audit hierarchy comparisons retain the native publisher paths separately.
  const result = normaliseDivisionRow(
    { ...row, hierarchies: [] },
    { deferHierarchyGuard: true, nativeSourceEvidence: true, branchCounts: branches },
  )
  counts.set(row.id, branches)
  return result
}

/** Check every administrative and full path, including each branch of cross-district ancestry. */
export function checkPreparedHierarchy(records: Row[], names: Row[]): AuditGuard {
  const guard: AuditGuard = {
    id: 'saanseoi-sar-area-district-hierarchy',
    summary:
      'District ancestry must follow Hong Kong SAR → Area → District; spatial remainders may end at SAR or Area.',
    consequence: 'block-ingestion',
    status: 'not-applicable',
    checked: 0,
    failed: 0,
    reason: 'No district ancestry is present.',
  }
  const byId = new Map(records.map(row => [row.id, row]))
  const failedIds: string[] = []
  const english = new Map(
    names.filter(row => row.locale === 'en').map(row => [row.divisionId, row.name]),
  )
  for (const row of records) {
    const hierarchies =
      typeof row.hierarchies === 'string'
        ? JSON.parse(row.hierarchies)
        : row.hierarchies
    const paths: Row[][] = hierarchies?.administrative ?? []
    const full: Row[][] = hierarchies?.full ?? []
    if (
      row.class !== 'district' &&
      ![...paths, ...full].some(path =>
        path.some(parent => parent.class === 'district'),
      )
    )
      continue
    guard.checked++
    const validPath = (ancestors: Row[], fullPath = false) => {
      const path = [...ancestors, ...(row.class === 'district' ? [row] : [])]
      const districts = path.filter(parent => parent.class === 'district')
      const validReferences =
        new Set(path.map(parent => parent.id)).size === path.length &&
        path.every(parent => {
          const actual = byId.get(parent.id)
          return (
            actual?.class === parent.class &&
            actual?.level === geographicDivisionClassification(parent.class)?.level
          )
        })
      // Spatial remainders may stop at SAR or Area when no district covers them.
      if (!districts.length && row.class !== 'district') {
        const administrative = path.filter(parent =>
          ['sar', 'area', 'district'].includes(parent.class),
        )
        return (
          validReferences &&
          administrative.length > 0 &&
          administrative.length <= 2 &&
          path[0]?.id === OVERTURE_HONG_KONG_SAR_DIVISION_ID &&
          path[0]?.class === 'sar' &&
          (administrative.length === 1 ||
            (path[1]?.class === 'area' &&
              overtureHongKongAreas.some(
                area => path[1]?.id === overtureHongKongAreaDivisionId(area.code),
              ))) &&
          (fullPath || path.length === administrative.length)
        )
      }
      if (districts.length !== 1) return false
      const district = districts[0]!
      const area = overtureHongKongAreas.find(area =>
        (area.districtNames as readonly string[]).includes(english.get(district.id)),
      )
      return (
        !!area &&
        (fullPath ? path.length >= 3 : path.length === 3) &&
        path[0]?.id === OVERTURE_HONG_KONG_SAR_DIVISION_ID &&
        path[0]?.class === 'sar' &&
        path[1]?.id === overtureHongKongAreaDivisionId(area.code) &&
        path[1]?.class === 'area' &&
        path[2]?.id === district.id &&
        validReferences
      )
    }
    const signature = (path: Row[]) =>
      path
        .filter(parent => ['sar', 'area', 'district'].includes(parent.class))
        .map(parent => parent.id)
        .join('/')
    const administrativePaths = new Set(paths.map(signature))
    const fullPaths = new Set(full.map(signature))
    const valid =
      paths.length > 0 &&
      full.length > 0 &&
      paths.every(path => validPath(path)) &&
      full.every(path => validPath(path, true)) &&
      administrativePaths.size === fullPaths.size &&
      [...administrativePaths].every(path => fullPaths.has(path))
    if (!valid) {
      guard.failed++
      failedIds.push(row.id)
    }
  }
  guard.status = guard.failed ? 'failed' : guard.checked ? 'passed' : 'not-applicable'
  if (guard.checked)
    guard.reason = guard.failed
      ? `${guard.failed} divisions have invalid administrative or full ancestry: ${failedIds.join(', ')}.`
      : 'Every checked district path follows SAR → Area → District; remainder paths retain a valid SAR or Area prefix, with matching administrative ancestry in both projections.'
  return guard
}

export function finishPreparationRules(
  evidence: Pick<PreparationEvidence, 'records' | 'names' | 'changes'>,
  counts: Map<string, BranchCounts>,
  native: Map<string, Row>,
): PreparationRuleEvidence {
  const branches = createBranchCounts(preparationRulesDeclaration.branches!)
  const changes = new Map(evidence.changes.map(row => [row.id, row as Row]))
  let normalised = 0,
    hierarchyAssigned = 0
  for (const record of evidence.records as Row[]) {
    const retained = counts.get(record.id)
    if (retained) {
      normalised++
      for (const [id, count] of Object.entries(retained))
        if (branches[id]) {
          branches[id]!.matched += count.matched
          branches[id]!.changed += count.changed
        }
    }
    const change = changes.get(record.id)
    if (!change?.names) throw Error(`Missing retained name comparison: ${record.id}`)
    for (const locale of locales) {
      const before =
        change.names.before.find((row: Row) => row.locale === locale)?.name ?? null
      const after =
        change.names.after.find((row: Row) => row.locale === locale)?.name ?? null
      const count =
        branches[`prepared-locale.${locale}.${after ? 'present' : 'absent'}`]!
      count.matched++
      if (before !== after) count.changed++
    }
    const raw = native.get(record.id)
    const hierarchy =
      typeof record.hierarchies === 'string'
        ? JSON.parse(record.hierarchies)
        : record.hierarchies
    const areas = new Set<string>(
      (hierarchy?.administrative ?? [])
        .flat()
        .filter((row: Row) => row.class === 'area')
        .map((row: Row) => row.id),
    )
    const original = new Set(
      (raw?.hierarchies ?? []).flat().map((row: Row) => row.division_id),
    )
    if (raw && [...areas].some(id => !original.has(id))) hierarchyAssigned++
  }
  return {
    declaration: preparationRulesDeclaration,
    branches,
    normalised,
    hierarchyAssigned,
    guards: [checkPreparedHierarchy(evidence.records, evidence.names)],
  }
}
