import type { ProducerSpecification } from './fieldLineageProducer'
const dir = 'apps/harbour-cli/src/lib/pipeline/places/'

export function placeResolutionProducer(path: string): ProducerSpecification | null {
  if (path === 'resolutionAnalysis')
    return {
      inputs: [
        'place',
        'officialAddresses',
        'officialAddressDefinitions',
        'previousAddressLinks',
        'sourceVersion',
      ],
      reads: {
        policy: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'place-address-curations.activePolicy',
        },
        decisions: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'place-address-decisions.decisions',
        },
        entries: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'place-address-curations.entries',
        },
      },
      implementation: {
        path: `${dir}supplementaryPlaceAddress.ts`,
        symbol: 'createSupplementaryAddressAnalyserInternal',
      },
      additionalImplementations: [
        {
          path: `${dir}processLocalPlaceSqlUploadSupplementary.ts`,
          symbol: 'prepareSupplementaryAddressesLocked',
        },
        { path: `${dir}placeAddressMatcher.ts`, symbol: 'parsePlaceAddress' },
        {
          path: 'libs/core/src/pipeline/services/places/place.ts',
          symbol: 'extractPlaceAddressTexts',
        },
      ],
      expression:
        'analyse({placeId: place.id, sourceRelease: sourceVersion, texts: extractPlaceAddressTexts(place.raw.addresses, place), lng: place.lng, lat: place.lat}, previousAddressLinks.get(place.id) ?? null)',
      audit: { category: 'rules', scope: 'bulk', retention: 'definition-only' },
      steps: [
        'Merge default decisions then explicit decisions and the entry ledger; require valid unique (placeId, sourceRelease, fingerprint) decisions and at most one live entry for the observation date. The captured instruction set belongs to this producer release.',
        'Compute the fingerprint from sorted unique normalised publisher texts; parse texts using selected en/zh-hant Address definitions. Strip only exact punctuation-insensitive Place/brand labels, preserving residual premise text.',
        'An exact observation decision is evaluated first. Require the expected previous link (or reproducible edited entry); leave_unlinked retires the link, create_supplementary requires a valid available ALS base, keep_existing must preserve identity, and link_existing requires an available official target. A failed decision returns review, not an automatic fallback.',
        'Otherwise replay the most recent eligible decision at/before the release, with matching text or retirement 2D fingerprint. Reapply coordinates only when the full fingerprint matches. Respect explicit retirement; then recorded official link, unchanged previous official relationship and reproducible accepted entry, in that order.',
        'For new candidates use recognised premise components, street evidence and retained aliases; bare numbers or geometry never create candidates. Score retained policy weights, retain contradictions, keep the best locale candidate per Address identity.',
        'Award geometry weight only to the nearest named candidate when all named candidates have geometry, it is within distanceMetres and separated by distanceMarginMetres. Sort by descending score then Address identity.',
        'Changed retired text or existing identity drift yields review. Reject ambiguous exact addresses. Exact or unique canonical-component links must be contradiction-free, within min(50, distanceMetres), and separated from every rival by max(20, separation).',
        'Below reviewThreshold or automaticThreshold yields delayed. Remaining candidates undergo the same proximity/contradiction/separation guards; structured supplementary creation uses supplementaryIdentity, immutable values, selected base, policy version and acceptanceMode.',
        'Compact resolved candidate/parse arrays in the staged stream; retain review details for unresolved review. Enrichment rejects all review outcomes.',
      ],
    }
  if (path === 'resolution')
    return {
      inputs: ['resolutionAnalysis'],
      implementation: {
        path: `${dir}supplementaryPlaceAddress.ts`,
        symbol: 'compactAddressResolution',
      },
      expression: 'compactAddressResolution(resolutionAnalysis)',
      resolutionCandidates: true,
      instructionSelector: {
        fixtureTypes: ['place-address-decisions', 'place-address-curations'],
      },
    }
  if (path === 'resolutions')
    return {
      inputs: ['resolution'],
      implementation: {
        path: `${dir}processLocalPlaceSqlUploadSupplementary.ts`,
        symbol: 'prepareSupplementaryAddressesLocked',
      },
      expression:
        'Evaluate resolution for every normalised Place in source order; retain accepted supplementary rows for address grouping.',
      selection: {
        cardinality: 'many',
        order: 'normalised Place stream order',
        guards: [
          'Reject duplicate/missing/out-of-order Place IDs and unresolved review.',
        ],
      },
    }
  if (path === 'supplementaryAddresses')
    return {
      inputs: [
        'resolutions',
        'officialAddresses',
        'sourceVersion',
        'datasetCode',
        'dependencySelection',
      ],
      implementation: {
        path: `${dir}supplementaryPlaceAddressRows.ts`,
        symbol: 'buildSupplementaryAddressRows',
      },
      expression:
        'Group tier=supplementary resolutions by entry.addressId; materialise each accepted structured Address exactly once.',
      steps: [
        'Require entry.addressId === resolution.addressId. Sort entries by placeId; require byte-equivalent JSON values and equal baseAddressId in a group. Require any base in the selected official Address inventory.',
        'Copy all ten ADDRESS_DIVISION_FIELDS from the base or null. Set geometry, bbox, parentAddressId, streetId and identifiers to null; compute granularity from accepted locale values. Retain supplementaryIdentityKey in Place curation as ID-generation evidence.',
        'Strip localisation provenance from API i18n rows and assign addressId. Hash canonical base and each locale independently; produce building-number lookup rows and their hashes.',
        'Attribute every contributing Place record in sources using the Overture publisher, registered Places dataset and Place record ID. Curation details remain in the Place audit.',
        'Current divisionSnapshotId is the base snapshot when present, otherwise the selected Division dependency. Sources belong to the supplementary materialisation; Place enrichment consumes this result, never the reverse.',
      ],
    }
  return null
}
