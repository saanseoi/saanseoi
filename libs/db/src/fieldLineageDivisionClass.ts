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
      level: 'Fallback level',
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
      group === 'Class Classification' ? 'Class' : 'Fallback level',
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
  return {
    kind: 'sections',
    sections: [
      {
        title: 'Overture → Division class',
        description:
          'First matching row wins. Existing landform classes (major_island, minor_island, islet, island_group) are retained. Other inputs are lowercased, trimmed, and spaces or hyphens become underscores.',
        rule: publisherClassificationRules('Class Classification'),
      },
      {
        title: 'Fallback level used by the Overture mapping',
        description:
          'Only used when the class mapping reaches its fallback rows. First matching row wins; substring checks follow subtype, class, then administrative level. This is a classification input, not the final API level.',
        rule: publisherClassificationRules('Level Classification'),
      },
      {
        title: 'SaanSeoi curation → final class',
        description:
          'Apply these steps in order. Local additions start with their SaanSeoi provided class.',
        rule: {
          kind: 'mapping',
          columns: ['Step', 'Class selection'],
          rows: [
            [
              'Classification instructions',
              'Matching classification correction; otherwise SaanSeoi class assignment; otherwise the Overture mapping above',
            ],
            [
              'Selected individual island',
              'SaanSeoi island class assignment; otherwise polygon area ≥ 10 km² → major_island; ≥ 0.01 km² → minor_island; otherwise islet',
            ],
            [
              'Curated hierarchy assignment',
              'Use the assigned class, including island_group. Selected individual islands keep their size classification when the hierarchy expects an individual-island class',
            ],
          ],
        },
      },
    ],
  }
}
