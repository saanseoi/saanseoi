import type { GeographicRule } from './fieldLineageGeographicRules'

export function hierarchyPreparationRules(): GeographicRule {
  return {
    kind: 'sections',
    sections: [
      {
        title: 'Areas used to build ancestry',
        description: '',
        rule: {
          kind: 'field-reference',
          field: 'geometry',
          resourceType: 'divisionArea',
          label: 'Uses SaanSeoi DivisionArea polygons',
          description:
            'Use the assembled areas of this Division and its possible parents, including SaanSeoi hand-drawn polygons. Hand-drawn polygons replace the corresponding non-administrative areas before ancestry is calculated. Administrative territories and island groups follow their own area-construction rules.',
        },
      },
      {
        title: 'Fallback when this Division has no area',
        description: '',
        rule: {
          kind: 'field-reference',
          field: 'geometry',
          resourceType: 'division',
          label: 'No DivisionArea → use the representative point',
          description:
            'Only when this Division has no area, test its representative point against the possible parents’ SaanSeoi DivisionAreas.',
        },
      },
      {
        title: 'Build a path for each covered part',
        description:
          'A path runs from broader ancestors to more local ones. Different parts of a Division can have different paths.',
        rule: {
          kind: 'sequence',
          steps: [
            'Start with the Division’s combined area polygons; use its representative point only when it has no area',
            'Consider eligible parents in order: SAR → regional area → district → island group → island or other landform → localities and neighbourhoods by increasing level',
            'At each tier, add each parent that overlaps the current part. Continue that branch using only the shared area; boundary contact alone does not count. For a point, the parent must cover it',
            'If several parents match, create a separate branch for each. Carry any uncovered area forward without adding a parent; never combine parents covering unrelated parts',
            'Retain explicitly curated ancestors that have no area geometry. Keep distinct ancestor paths and remove duplicates',
          ],
        },
      },
      {
        title: 'Which parents are eligible?',
        description:
          'Exclude the Division itself, countries and parents without area geometry from the spatial search.',
        rule: {
          kind: 'mapping',
          columns: ['Parent kind', 'Allowed for'],
          rows: [
            [
              'Administrative',
              'Non-administrative Divisions; administrative Divisions only when the parent has a lower level',
            ],
            [
              'Island group',
              'Non-administrative Divisions other than island groups. For an island with recorded group membership, it must be a member',
            ],
            [
              'Island or other landform',
              'Divisions that are neither administrative nor landforms',
            ],
            [
              'Locality or neighbourhood',
              'Divisions that are neither administrative nor landforms, and have a higher level than the parent',
            ],
            [
              'Hong Kong Island landform exception',
              'Districts are not parents of this landform',
            ],
          ],
        },
      },
      {
        title: 'When geometry is unavailable',
        description:
          'Missing geometry does not disprove an explicitly curated relationship.',
        rule: {
          kind: 'priority',
          branches: [
            {
              when: 'Division has neither area nor point',
              value: 'Keep its curated paths',
            },
            {
              when: 'An explicitly curated ancestor has no area',
              value:
                'Append it to the spatial paths, preserving its curated order and avoiding duplicate IDs',
            },
          ],
        },
      },
    ],
  }
}
