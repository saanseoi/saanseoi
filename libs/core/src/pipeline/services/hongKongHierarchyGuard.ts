import { ProcessingGuardError, type AuditGuard } from '../../provenance'
import {
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
} from './overtureHongKongAreas'

type Entry = {
  division_id: string
  type: string
  level: number
  i18n: { en?: { name: string } }
}

export function createHongKongHierarchyGuard(): AuditGuard {
  return {
    id: 'hong-kong-sar-area-district-hierarchy',
    summary: 'Hong Kong divisions must follow SAR → Area → District ancestry.',
    consequence: 'block-ingestion',
    status: 'not-applicable',
    checked: 0,
    failed: 0,
    reason: 'No Hong Kong district ancestry has been checked.',
  }
}

/** Validation is separate from area insertion; unknown assignments require review. */
export function checkHongKongHierarchy(
  input: {
    country?: unknown
    id: string
    type: string
    level: number
    name?: string
    hierarchy: unknown
  },
  guard = createHongKongHierarchyGuard(),
) {
  const ancestors = Array.isArray(input.hierarchy) ? (input.hierarchy as Entry[]) : []
  const isDistrict = input.type === 'district'
  const districtAncestors = ancestors.filter(entry => entry.type === 'district')
  const isHongKong =
    input.country === 'HK' ||
    ancestors.some(entry => entry.division_id === OVERTURE_HONG_KONG_SAR_DIVISION_ID)
  if (!isHongKong || (!isDistrict && !districtAncestors.length)) return
  guard.checked++
  const fail = (reason: string): never => {
    guard.failed++
    guard.status = 'failed'
    guard.reason = `Division ${input.id}: ${reason} Requires reviewed hierarchy resolution.`
    throw new ProcessingGuardError(guard.reason, [{ ...guard }])
  }
  const path: Entry[] = [
    ...ancestors,
    {
      division_id: input.id,
      type: input.type,
      level: input.level,
      i18n: { en: { name: input.name ?? '' } },
    },
  ]
  const districts = path.filter(entry => entry.type === 'district')
  const [district] = districts
  if (districts.length !== 1 || !district)
    fail('Expected exactly one district in the canonical ancestry.')
  const areas = overtureHongKongAreas.filter(area =>
    (area.districtNames as readonly string[]).includes(district.i18n.en?.name ?? ''),
  )
  const [area] = areas
  if (areas.length !== 1 || !area)
    fail('The district has no unambiguous recognised Hong Kong Area.')
  const areaId = overtureHongKongAreaDivisionId(area.code)
  const sarIndex = path.findIndex(
    entry => entry.division_id === OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  )
  if (
    sarIndex < 0 ||
    path[sarIndex]?.type !== 'sar' ||
    path[sarIndex]?.level !== 0 ||
    path[sarIndex + 1]?.division_id !== areaId ||
    path[sarIndex + 1]?.type !== 'area' ||
    path[sarIndex + 1]?.level !== 1 ||
    path[sarIndex + 2] !== district ||
    district.level !== 2 ||
    new Set(path.map(entry => entry.division_id)).size !== path.length
  ) {
    fail(
      'Expected SAR → recognised Area → District, without duplicate or conflicting ancestors.',
    )
  }
  guard.status = 'passed'
  guard.reason = 'Every division adheres to the top-level hierarchy.'
}
