import pins from '../../../fixtures/meta/datasetInputs/native-division-administrative-hierarchy.json'
import type { CurrentFieldRule } from './fieldLineageCurrentRules'
import type { HumanOperation } from './fieldLineageHuman'

export const inferredAdministrativeDatasets = new Set([
  'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
  'ds-hk-hkgov-pland-division-new-town',
  'ds-hk-hkgov-landsd-division',
])

export function nativeAdministrativeHierarchyFieldRule(
  dataset: string,
): CurrentFieldRule {
  const point = dataset === 'ds-hk-hkgov-landsd-division'
  return {
    implementation: {
      path: 'apps/harbour-cli/src/lib/pipeline/divisions/nativeAdministrativeHierarchy.ts',
      symbol: 'createNativeAdministrativeHierarchy',
    },
    expression: point
      ? 'Select every district covering the native settlement Point and materialise its separate HKSAR → Area → District path.'
      : 'Select every district with intersectionArea / area(sourcePolygon ∩ districtUnion) >= 0.05, using unrounded EPSG:2326 areas; materialise a separate HKSAR → Area → District path for each selected district.',
    inputs: ['id', 'geometry'],
    steps: [
      'The publisher supplies the native geometry, not these administrative parents. SaanSeoi infers the fill from hash-pinned administrative reference archives; never resolve CURRENT/latest polygons.',
      ...pins.sourceReleases.map(
        pin => `${pin.releaseCode}: SHA-256 ${pin.contentHash}.`,
      ),
      `Resolve stable canonical ancestor identities, names and complete district paths from the retained reference fixture extracted from ${pins.canonicalReference.releaseCode} (archive SHA-256 ${pins.canonicalReference.archiveSha256}). Read original Overture territorial polygons from the pinned source archive; derive each Area by unioning its constituent district territories, matching SaanSeoi administrative assembly.`,
      point
        ? 'A boundary point may select multiple districts. Do not assign polygon full containment to a point-only settlement.'
        : 'Exclude uncovered territory from the selection denominator. Retain whole-source fractions, uncovered area and selected/rejected branches. The 5% cutoff is inclusive and is not a population weight.',
      'Limit ancestry to sar, area and district. No nearest-district fallback: unmatched source geometry retains empty ancestry with an explicit audit outcome.',
      'Retain the policy, input archive pins, source/ancestor geometry fingerprints and per-record decisions in the assembly audit. Polygon full_containment requires the complete source polygon to be covered by that ancestor.',
      'Hash the inferred canonical hierarchy with the Division content before writing HISTORY, replay membership and CURRENT.',
    ],
    additionalImplementations: [
      {
        path: 'apps/harbour-cli/src/lib/pipeline/divisions/nativeAdministrativeHierarchyInputs.ts',
        symbol: 'loadNativeAdministrativeHierarchy',
      },
    ],
  }
}

export function nativeAdministrativeHierarchyHuman(dataset: string): HumanOperation {
  return {
    kind: 'calculate',
    title: 'Infer administrative ancestry',
    description:
      dataset === 'ds-hk-hkgov-landsd-division'
        ? 'SaanSeoi fills HKSAR, Area and District ancestry by checking which pinned district polygons cover the publisher’s settlement point. Boundary points can have more than one path. This is inferred ancestry; the publisher supplies no administrative parent.'
        : 'SaanSeoi fills HKSAR, Area and District ancestry from the publisher’s polygon and pinned administrative polygons. Each district covering at least 5% of the polygon’s district-covered area contributes a separate path. Uncovered territory is excluded from that denominator. This is inferred ancestry; overlap alone does not establish full containment.',
    fieldDependencies: ['geometry'],
  }
}
