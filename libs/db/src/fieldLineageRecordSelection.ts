import type { HumanSourceUse } from './fieldLineageHuman'
import type { GeographicRule } from './fieldLineageGeographicRules'
type Selection = Extract<GeographicRule, { kind: 'source-selection' }>
const cases = (...items: Selection['cases']): Selection => ({
  kind: 'source-selection',
  cases: items,
})

/** Source selection cases are independent, not a priority or fallback list. */
export function withRecordSelection(
  sources: HumanSourceUse[],
  field = '',
  resource = 'division',
): HumanSourceUse[] {
  return sources.map(source => ({
    ...source,
    selection:
      source.selection ??
      (source.datasetCode === 'ds-hk-overture-division'
        ? source.resourceType === 'divisionArea'
          ? cases(
              {
                when: 'Building the SAR or a district’s territory',
                steps: [
                  {
                    action: 'Select every polygon matching both conditions',
                    all: ['divisionId = this Division’s ID', 'isTerritorial = true'],
                  },
                  { action: 'Combine the selected polygons into one territory' },
                ],
              },
              {
                when: 'Building Hong Kong Island, Kowloon or New Territories',
                steps: [
                  {
                    action:
                      'Find the member districts listed for this area in SaanSeoi’s hierarchy',
                  },
                  {
                    action:
                      'Select each district’s territorial polygons using both conditions above',
                  },
                  { action: 'Combine all member-district territories' },
                ],
              },
            )
          : cases({
              when: 'The SaanSeoi inventory references an Overture Division id',
              steps: [{ action: 'Select the Overture Division record with that id' }],
            })
        : source.datasetCode === 'ds-hk-hkgov-landsd-division'
          ? cases(
              {
                when: 'An island has a LANDSD:PLACE_NAME identity',
                steps: [
                  { action: 'Read the place-name record ID from that identity' },
                  { action: 'Select the LandsD record with that ID' },
                ],
              },
              ...(/bbox|geometry/.test(field)
                ? [
                    {
                      when: 'A SaanSeoi-added locality has a LandsD-sourced point',
                      steps: [
                        {
                          action:
                            'Use the point saved in the SaanSeoi addition; its evidence records the LandsD origin',
                        },
                      ],
                    },
                  ]
                : []),
            )
          : source.datasetCode === 'ds-hk-protomaps-island'
            ? cases(
                {
                  when: 'The Division is an island and its SaanSeoi polygon selection references Protomaps',
                  steps: [
                    {
                      action:
                        'Read sourceRecordId from the SaanSeoi polygon selection and select that Protomaps record',
                    },
                    {
                      action:
                        'Use the curated geometry if supplied; otherwise use the selected source polygon',
                    },
                  ],
                },
                ...(resource === 'divisionArea' ||
                /bbox|geometry|hierarchies/.test(field)
                  ? [
                      {
                        when: 'Building the land-only part of an administrative territory',
                        steps: [
                          {
                            action: 'Select every polygon matching both conditions',
                            all: [
                              'kind = coastline-land',
                              'Overlap with the territory has positive area',
                            ],
                          },
                          {
                            action:
                              'Clip the selected land polygons to the territory and combine the results',
                          },
                        ],
                      },
                    ]
                  : []),
              )
            : undefined),
  }))
}
