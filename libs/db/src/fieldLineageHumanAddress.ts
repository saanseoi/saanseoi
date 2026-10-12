import type { HumanOperation } from './fieldLineageHuman'
const op = (
  kind: HumanOperation['kind'],
  title: string,
  description: string,
): HumanOperation => ({ kind, title, description })
/** Address producer semantics, independent of numbered inventory-pass identifiers. */
export function humanAddressProducer(
  code: string,
  specification: Record<string, unknown>,
): HumanOperation | undefined {
  if (!code.startsWith('address-')) return
  const path = code.slice('address-'.length)
  const symbol = (specification.implementation as { symbol?: string })?.symbol
  if (/^als(?:Initial|Final)Transform\d+$/.test(path)) {
    const description = (specification.steps as string[] | undefined)?.[0]
    if (!description) return
    const title =
      symbol === 'backfillAlsCoordinates' || symbol === 'backfillOiHei'
        ? 'SaanSeoi curated coordinate correction'
        : symbol === 'applyAlsEstateNames'
          ? 'SaanSeoi curated estate name'
          : symbol === 'applyReviewedPremiseRenames'
            ? 'SaanSeoi curated premise name'
            : symbol === 'applyAlsLocalities'
              ? 'SaanSeoi curated locality'
              : symbol === 'restoreAlsEstateComponents' ||
                  symbol === 'restoreAlsEstateGaps'
                ? 'SaanSeoi curated estate components'
                : symbol === 'applyReviewedBlockDetailBackfills'
                  ? 'SaanSeoi curated block components'
                  : symbol === 'applyReviewedBuildingOverrides'
                    ? 'SaanSeoi curated building components'
                    : symbol === 'applyAlsNestedPremises' ||
                        symbol === 'linkReviewedHouseStreetParents' ||
                        symbol === 'applyReviewedAlsParents'
                      ? 'SaanSeoi curated parent relationship'
                      : description.split(';')[0]!.replace(/\.$/, '')
    return op('select', title, description)
  }
  const known: Record<string, [HumanOperation['kind'], string, string]> = {
    alsRawFeatures: [
      'copy',
      'Publisher address features',
      'Read the district address files in the selected ALS archive. Keep each feature’s source file and position.',
    ],
    alsRetainedFeatures: [
      'select',
      'Select address features',
      'Retain the accepted premises and houses, including explicitly SaanSeoi curated reconstructions and additions.',
    ],
    alsBaselineRows: [
      'normalise',
      'Publisher address components',
      'Normalise the publisher’s bilingual address components and coordinates. Resolve shared block and phase-number patterns across the release.',
    ],
    alsIdentityRows: [
      'combine',
      'Resolve the address identity',
      'Combine equivalent premises and SaanSeoi curated aliases into their accepted identity. A merged premise uses the surviving address record.',
    ],
    alsFinalRows: [
      'lookup',
      'Match geographic membership',
      'Resolve the prepared address against the release’s selected Division geometry after applicable coordinate and locality corrections.',
    ],
    alsSelectedRow: [
      'select',
      'Accepted address record',
      'Use the surviving record for this address identity, including any SaanSeoi curated merge or replacement.',
    ],
    alsCorrectedRow: [
      'select',
      'SaanSeoi curated component corrections',
      'Apply matching building or estate name corrections for the source release and address identity. Preserve components not targeted by the correction.',
    ],
    componentCorrections: [
      'copy',
      'Applied component corrections',
      'Keep the accepted building and estate component corrections used to determine the address classification.',
    ],
    i18n: [
      'normalise',
      'Localised address components',
      'Build English and Traditional Chinese address components separately. Derive the number, block and phase components for each language.',
    ],
    divisionRelationships: [
      'link',
      'Related Divisions',
      'Link the address to its selected country, landform and locality Divisions, retaining each relationship’s geographic role.',
    ],
    dependencySelection: [
      'select',
      'Selected geographic release',
      'Use the exact companion geographic releases retained with this address publication.',
    ],
    selectedDivisions: [
      'copy',
      'Division identities and names',
      'Read the Division identities, classes, parent paths and names from the selected geographic release.',
    ],
    selectedDivisionAreas: [
      'copy',
      'Division areas',
      'Read the Division area geometries from the selected geographic release.',
    ],
    divisionMaps: [
      'lookup',
      'Match named and spatial geography',
      'Match normalised geographic names to Division identities, and use their area geometry for location-based membership.',
    ],
  }
  if (known[path]) {
    const human = op(...known[path]!)
    if (path === 'alsBaselineRows')
      human.fieldViews = [
        {
          fields: ['geometry'],
          title: 'Prepare publisher coordinates',
          description:
            'Use the publisher geometry, except for the matching SaanSeoi curated Lin Tsui correction, which supplies an explicit point.',
          inputs: ['alsRetainedFeatures', 'instructions'],
        },
      ]
    return human
  }
  if (symbol === 'normaliseAddressRowForPipelineInternal')
    return op(
      'copy',
      'Prepared address component',
      'Read this component from the accepted address after applicable SaanSeoi curated corrections.',
    )
}
