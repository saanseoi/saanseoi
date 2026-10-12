const preparation =
  'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadPreparation.ts'
const normalisation = 'libs/core/src/pipeline/services/places/place.ts'
const rows =
  'apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts'

/** Current base/detail producers. Unspecified companion reads remain graph boundaries. */
export function placePreparedSpecification(path: string) {
  const implementation = { path: preparation, symbol: 'stageEnrichedPlaces' }
  switch (path) {
    case 'place':
      return {
        inputs: ['sourceVersion'],
        rawRecord: true,
        implementation: {
          path: normalisation,
          symbol: 'normaliseOverturePlaceInternal',
        },
        additionalImplementations: [{ path: preparation, symbol: 'stagePlaces' }],
        expression: 'normaliseOverturePlace(publisherRecord, sourceVersion)',
        steps: [
          'Require a non-empty string id and usable Point coordinates; otherwise omit the row.',
          'Normalise names, brand names and publisher free-form addresses into locale rows, preserving locale-conflict evidence separately.',
          'Read taxonomy.primary before categories.primary; categories.alternate precedes taxonomy.alternates and taxonomy.alternate. Retain publisher bbox independently of coordinates.',
          'Set firstSeenMonth and lastSeenMonth to sourceVersion.slice(0, 7), and retain raw publisher content for source hashing.',
          'The staging pass checks publisher address cardinality and excludes CN/MO address countries. A missing country remains included.',
        ],
      }
    case 'canonicalPlaceIdentity':
      return {
        inputs: ['place', 'predecessorPlaceHistory', 'sourceVersion'],
        implementation: {
          path: 'libs/core/src/pipeline/services/places/placeIdentity.ts',
          symbol: 'matchPlaceIdentities',
        },
        expression:
          'matchPlaceIdentities(incomingEvidence, exactPredecessorEvidence, lineageScope, sourceVersion)',
        steps: [
          'Retain publisher IDs in raw source records. Match canonical Place IDs across the complete incoming release with a minimum score of 85 and a bidirectional margin of 15.',
          'Require an identity/contact anchor and proximity; reject conflicting shop units/floors. Rebrands additionally require identical known phones, category and another continuity signal, within 30 metres, without ancillary conflicts.',
          'Allocate deterministic SaanSeoi UUIDs from scope, birth release and normalised evidence when evidence is insufficient or ambiguous. Retain scores, conflicts and candidate IDs in source resolutions and canonical history.',
        ],
      }
    case 'i18n':
      return {
        inputs: ['place'],
        implementation: { path: normalisation, symbol: 'mergePlaceI18n' },
        expression: 'place.i18n',
        steps: [
          'Use the locale rows produced from publisher names, brand names and free-form addresses.',
          'The current Place upload does not invoke the standalone Place translation resolver. Do not invent translation or reviewed-name candidates.',
        ],
      }
    case 'accessHint':
      return {
        inputs: ['i18n'],
        implementation: { path: rows, symbol: 'buildPlaceSql' },
        expression: 'selectedLocale.accessHint ?? null',
        steps: [
          'The current normaliser does not populate accessHint. The materialiser stores null for each emitted locale; it does not infer a hint from address matching.',
        ],
      }
    case 'effectiveCoordinates':
      return {
        inputs: ['place', 'resolution'],
        implementation,
        expression: '[resolution.lng ?? place.lng, resolution.lat ?? place.lat]',
        steps: [
          'Reject resolution.tier === "review" before enrichment.',
          'Apply longitude and latitude nullish fallback independently. Zero is a coordinate, not absence.',
          'Persist effectiveLng/effectiveLat when either differs; buildPlaceSql uses those coordinates for the canonical point and H3 cells.',
        ],
        additionalImplementations: [{ path: rows, symbol: 'buildPlaceSql' }],
      }
    case 'selectedAddress':
      return {
        inputs: ['resolution', 'officialAddresses', 'supplementaryAddresses'],
        implementation,
        expression:
          'resolution.addressId ? (resolution.tier === "supplementary" ? supplementaryById : addressById).get(resolution.addressId) : undefined',
        guards: [
          'Official addresses must come from the exact selected Address snapshot via its prepared publication receipt scope.',
          'Supplementary addresses must be materialised before enrichment. Reject review resolutions and an accepted addressId without a materialised row.',
        ],
      }
    case 'address2dId':
      return {
        inputs: ['resolution', 'selectedAddress'],
        implementation,
        expression: 'resolution.addressId',
      }
    case 'unitReference':
      return {
        inputs: [
          'resolution',
          'place',
          'selectedAddress',
          'selectedAddress3dCollections',
        ],
        implementation: {
          path: 'apps/harbour-cli/src/lib/pipeline/places/placeAddress3d.ts',
          symbol: 'matchPlaceAddress3d',
        },
        expression:
          'address && resolution.tier !== "supplementary" ? matchPlaceAddress3d(selectedSnapshot, address, place.addresses ?? []) : null',
        steps: [
          'Parse publisher address texts; accept only one explicit floor and flat token per text, with one distinct floorRef/unitRef pair across texts.',
          'Search Address3D collections in address.id then parentAddressId order, within the exact selected Address snapshot.',
          'Skip collections without coverage; require exactly one unit of floorType F and unitType F matching both references. Ambiguous or absent matching units yield null.',
          'Validate the selected collection, unit identity and coverage membership before returning address3dId, address3dUnitId and address3dMembership.',
        ],
      }
    case 'divisionMembership':
      return {
        inputs: [
          'effectiveCoordinates',
          'selectedAddress',
          'selectedDivisions',
          'selectedDivisionAreas',
        ],
        implementation,
        expression:
          'createDivisionMembership(divisions, areas).resolve({ lng, lat, fallback: selectedAddress, fallbackMethod: "address" })',
        guards: [
          'Read Divisions through the exact selected snapshot prepared receipt.',
          'Require an exact DivisionArea snapshot dependency and a receipt with preparedAt and publicationToken; read geometry from its scopeId.',
        ],
        additionalImplementations: [
          {
            path: 'apps/harbour-cli/src/lib/pipeline/divisions/divisionMembership.ts',
            symbol: 'createDivisionMembership',
          },
        ],
        steps: [
          'Use effective coordinates after address resolution, with accepted Address Division references as fallback.',
          'Deduplicate resulting divisionIds and retain association evidence with both selected Division and DivisionArea snapshot IDs.',
        ],
      }
    case 'previousIdentity':
      return {
        inputs: ['id', 'predecessorPlaceHistory'],
        implementation: { path: rows, symbol: 'buildPlaceSql' },
        expression: 'new Map(historyRows.map(state => [state.row.id, state])).get(id)',
        guards: [
          'History is the serving predecessor replay, not all rows whose isCurrent flag is true.',
          'Require exact retained versions and matching serving-scope membership; reject missing shards, duplicate content or locales without their base.',
        ],
        additionalImplementations: [
          {
            path: 'apps/harbour-cli/src/lib/pipeline/places/placeHistoryBaseline.ts',
            symbol: 'loadCurrentPlaceHistory',
          },
        ],
      }
    case 'previousContentHash':
      return {
        inputs: ['previousIdentity'],
        implementation: { path: rows, symbol: 'buildPlaceSql' },
        expression: 'previousIdentity?.row.versionHash',
      }
    case 'contentHash':
      return {
        inputs: [
          'place',
          'effectiveCoordinates',
          'address2dId',
          'unitReference',
          'divisionMembership',
          'addressDependencyHash',
          'divisionAssociation',
        ],
        implementation: { path: normalisation, symbol: 'hashPlaceMaterialisation' },
        expression: 'createHash(canonicalBaseContent)',
        steps: [
          'Hash id, effective coordinates, publisher bbox, operatingStatus, basicCategory, taxonomyPrimary/Hierarchy/Alternates, wikidataId, websites, socials, emails, phones, addresses and confidence.',
          'Include retained Place identity evidence so source-ID transitions and the latest matching inputs survive historical replay.',
          'Include addressDependencyHash, address2dId, all three nullable Address3D references, sorted unique divisionIds and divisionAssociation when present.',
          'Localised fields, first/last seen months, source payload, publication snapshot IDs and timestamps are not independent base-content hash fields. Locales have separate content hashes.',
        ],
      }
    default:
      return null
  }
}
