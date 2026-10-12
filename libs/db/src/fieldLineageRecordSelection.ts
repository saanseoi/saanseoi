import type { HumanSourceUse } from './fieldLineageHuman'
import type { GeographicRule } from './fieldLineageGeographicRules'
const table = (rows: string[][]): GeographicRule => ({
  kind: 'mapping',
  columns: ['Record selection', 'Match'],
  rows,
})

/** Keys used by reviewInputs, buildRelease and administrativeAreas, independent of value derivation. */
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
          ? table([
              ['Area owner', 'Area divisionId = canonical Division ID'],
              [
                'Administrative territory',
                'isTerritorial = true; keep all matching polygons',
              ],
              [
                'Regional administrative area',
                'Configured member districts supply the territories',
              ],
            ])
          : table([
              ['Publisher Division', 'Overture ID = SaanSeoi inventory Division ID'],
              [
                'Curated identity merge',
                'Resolve the explicit alias to its canonical ID',
              ],
            ])
        : source.datasetCode === 'ds-hk-hkgov-landsd-division'
          ? table([
              [
                'Selected island identity',
                'LANDSD:PLACE_NAME identity → matching place-name record ID',
              ],
              ...(/bbox|geometry/.test(field)
                ? [
                    [
                      'Curated land-based locality',
                      'Use the point recorded in the SaanSeoi addition; its curation evidence identifies the LandsD origin',
                    ],
                  ]
                : []),
            ])
          : source.datasetCode === 'ds-hk-protomaps-island'
            ? table([
                [
                  'Selected island polygon',
                  'Curated geometry selection → sourceRecordId',
                ],
                ...(resource === 'divisionArea' ||
                /bbox|geometry|hierarchies/.test(field)
                  ? [
                      [
                        'Selected polygon components',
                        'Use the component indexes in the curated selection',
                      ],
                      [
                        'Administrative land mask',
                        'kind = coastline-land; positive-area overlap with the territory',
                      ],
                    ]
                  : []),
              ])
            : undefined),
  }))
}
