import policyFixture from '../../../fixtures/meta/processing-rules/assembly/division-normalisation.json'
import {
  divisionTaxonomyBranches,
  type BranchCondition,
} from './divisionClassificationBranches'
import type { GeographicRule } from './fieldLineageGeographicRules'
const policy = policyFixture.parameters

export function classificationCondition(condition: BranchCondition): string {
  if ('all' in condition)
    return condition.all.length
      ? condition.all.map(classificationCondition).join(' and ')
      : 'Otherwise'
  if ('any' in condition) return condition.any.map(classificationCondition).join(' or ')
  if (condition.field === 'isHongKongArea')
    return 'SaanSeoi reconstructed Hong Kong Island, Kowloon or New Territories Division'
  if (condition.field === 'hasParent') return 'Publisher parent ID exists'
  const label =
    {
      subtype: 'Publisher subtype',
      class: 'Publisher class',
      adminLevel: 'Publisher administrative level',
      level: 'Publisher level',
    }[condition.field] ?? condition.field
  return 'contains' in condition
    ? `${label} contains ${condition.contains}`
    : `${label} = ${condition.equals}`
}
export function publisherClassificationRules(
  group: 'Class Classification' | 'Level Classification',
): GeographicRule {
  return {
    kind: 'mapping',
    columns: [
      'First matching condition',
      group === 'Class Classification' ? 'Class' : 'Publisher level',
    ],
    rows: divisionTaxonomyBranches(policy)
      .filter(branch => branch.group === group)
      .map(branch => [
        classificationCondition(branch.condition),
        String(branch.result),
      ]),
  }
}
export function divisionClassRules(): GeographicRule {
  const publisher = publisherClassificationRules('Class Classification')
  if (publisher.kind !== 'mapping') throw Error('Expected classification mapping')
  return {
    kind: 'mapping',
    columns: ['First matching check wins', 'Class'],
    rows: [
      ['SaanSeoi correction to Overture', 'Corrected class'],
      ['SaanSeoi class assignment', 'Assigned class (including island_group)'],
      ['Selected individual island; polygon area ≥ 10 km²', 'major_island'],
      ['Selected individual island; polygon area ≥ 0.01 km²', 'minor_island'],
      ['Selected individual island', 'islet'],
      ...publisher.rows,
      ['No match', 'Stop ingestion; explicit SaanSeoi classification required'],
    ],
  }
}
