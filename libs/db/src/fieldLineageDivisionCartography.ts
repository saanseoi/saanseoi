import { divisionCartography } from './divisionTaxonomy'
import {
  landsdSettlementCartography,
  nativeDivisionCartography,
} from './divisionCartography'
import type { GeographicRule } from './fieldLineageGeographicRules'

/** The audit tables and materialisers consume the same label policies. */
export function divisionCartographyRule(dataset: string): GeographicRule {
  const landsd = dataset === 'ds-hk-hkgov-landsd-division'
  const policies = landsd
    ? landsdSettlementCartography
    : dataset.startsWith('ds-hk-hkgov-pland-')
      ? Object.fromEntries(
          Object.entries(nativeDivisionCartography).filter(([key]) =>
            dataset.endsWith('-new-town')
              ? key === 'planning-newtown'
              : key !== 'planning-newtown' && key.startsWith('planning-'),
          ),
        )
      : dataset.endsWith('housing-market-areas-building-groups')
        ? { 'housing-market-area': nativeDivisionCartography['housing-market-area'] }
        : divisionCartography
  return {
    kind: 'mapping',
    columns: [
      landsd ? 'Native PLACE_TYPE' : 'Class',
      'Min zoom',
      'Prominence',
      'Max zoom',
    ],
    rows: Object.entries(policies).map(([klass, [minZoom, prominence, maxZoom]]) => [
      klass,
      String(minZoom),
      String(prominence),
      String(maxZoom),
    ]),
  }
}
