import { withRecordSelection } from './fieldLineageRecordSelection'
import { geometryHumanProducer } from './fieldLineageGeometryHuman'
import { geographicFieldRule } from './fieldLineageGeographicRules'
import { withHumanFieldEffects } from './fieldLineageHumanEffects'
import { humanAddressProducer } from './fieldLineageHumanAddress'
import type { HumanOperation } from './fieldLineageHuman'
const rule = (
  kind: HumanOperation['kind'],
  title: string,
  description: string,
): HumanOperation => ({ kind, title, description })

/** Known producer operations. Unlisted operations stay explicitly unexplained. */
export function humanProducer(
  code: string,
  specification: Record<string, unknown>,
): HumanOperation | undefined {
  const geometry = geometryHumanProducer(code, specification)
  if (geometry)
    return {
      ...geometry,
      ...(geometry.sources
        ? {
            sources: withRecordSelection(
              geometry.sources,
              String(specification.outputPath ?? ''),
              'divisionArea',
            ),
          }
        : {}),
    }
  if (
    code === 'division-response-field' &&
    specification.resourceType === 'division' &&
    String(specification.apiField).startsWith('relationships.')
  )
    return {
      kind: 'link',
      title: 'API response',
      description:
        'Return the matching resources as type and ID pairs. An included collection with no matches returns an empty list.',
      rule: geographicFieldRule(String(specification.apiField))!,
    }
  if (code === 'division-name-alias-rule')
    return {
      kind: 'combine',
      title: 'Add conventional name variants',
      description:
        'For the selected language, add the configured suffix replacement to matching publisher names, then remove duplicate alternatives.',
      decisions: (
        (specification.rules ?? []) as Array<{
          locale: string
          suffix: string
          replacement: string
        }>
      ).map(value => ({
        when: `${value.locale} name ends with “${value.suffix}”`,
        result: `Also include the name ending with “${value.replacement}”.`,
      })),
    }
  const address = humanAddressProducer(code, specification)
  if (address) return withHumanFieldEffects(address, specification)
  const implementation = specification.implementation as { symbol?: string } | undefined
  const symbol = implementation?.symbol
  const known: Record<string, [HumanOperation['kind'], string, string]> = {
    'simplified-area-display': [
      'calculate',
      'Simplify the area for display',
      'Simplify the complete area coverage together at a tolerance of 10 metres, preserving shared boundaries. Recalculate bounds from the resulting geometry.',
    ],
    'normalised-government-area-coverage': [
      'combine',
      'Shared area coverage',
      'Collect the selected government areas in a consistent order so adjacent areas are simplified together.',
    ],
    'division-geometry-type': [
      'select',
      'Coverage type',
      'Classify the geometry from its land and territorial flags.',
    ],
    'saanseoi-division-name': [
      'select',
      'SaanSeoi curated localised name',
      'Use the SaanSeoi curated name for the requested language and Division identity.',
    ],
    'statistic-publisher-field-selection': [
      'select',
      'Select observation columns',
      'Consider publisher columns in source order. Exclude identity columns and empty values; convert each remaining observation according to the dataset profile.',
    ],
    'select-packed-statistic-value': [
      'select',
      'Select the observation',
      'Read this field’s converted observation for the selected geography and reference period.',
    ],
    'statistic-definition-fold': [
      'combine',
      'Build the field definition',
      'Combine the SaanSeoi curated field metadata and the accepted observations. Numeric and non-published observations establish a numeric field.',
    ],
    'statistic-sourceFeatureRef': [
      'assign',
      'Publisher feature reference',
      'Combine the publisher, dataset, source release and native feature identity into an unambiguous source reference.',
    ],
    'statistic-geography': [
      'select',
      'Observation geography',
      'Use a SaanSeoi curated geography override when present; otherwise derive geography from the dataset’s geographic dimensions. Attach the matching area collection for the reference period where configured.',
    ],
    'statistic-packedRecord': [
      'combine',
      'Group observations',
      'Group accepted observations by dataset, geography and reference period. Keep the contributing publisher fields and exact field definitions with each value.',
    ],
    'statistic-properties': [
      'copy',
      'Publisher properties',
      'Read the property values from the selected publisher feature.',
    ],
    'statistic-areaCompanionByReferencePeriod': [
      'lookup',
      'Area collection for the period',
      'Use the area collection explicitly selected for this dataset and reference period.',
    ],
    'statistic-seriesRows': [
      'combine',
      'Observation series',
      'Group source observations by dataset, reference period and publisher feature.',
    ],
    'statistic-recordObservations': [
      'combine',
      'Accepted observations',
      'Collect converted observations for the same series, preserving publisher property order.',
    ],
    'statistic-statisticDivisionId': [
      'lookup',
      'Match the Division',
      'Resolve the publisher’s geographic identity through the SaanSeoi curated mapping for this release.',
    ],
    'statistic-intakeRows': [
      'copy',
      'Read publisher features',
      'Read the selected source archive’s geographic features in publisher order.',
    ],
    'statistic-divisionIdentityBridge': [
      'lookup',
      'Geographic identity mapping',
      'Use the SaanSeoi curated geographic identity mapping selected for the dataset and source release.',
    ],
    'statistic-sourceFeatureIdentity': [
      'assign',
      'Native feature identity',
      'Combine the publisher layer name and native feature identity.',
    ],
    'statistic-geographyOverride': [
      'lookup',
      'SaanSeoi curated geography',
      'Look up the publisher’s geographic code in the SaanSeoi curated identity mapping for this source release.',
    ],
    'planning-planningRows': [
      'combine',
      'Prepare Planning Divisions',
      'Build the Planning Divisions from the selected publisher archive, repairing and combining geometries according to the planning hierarchy.',
    ],
    'planning-unit-geometry': [
      'combine',
      'Planning-unit geometry',
      'Combine the selected planning cells into their owning planning units.',
    ],
    'planning-geometry': [
      'select',
      'Planning geometry',
      'Use the repaired or combined shape for this Planning Division.',
    ],
    'planning-translatedPlanningDivisions': [
      'lookup',
      'Planning parent lookup',
      'Use the prepared Planning Division identities, classes and localised names to resolve parent relationships.',
    ],
    'planning-sourceReleaseTranslations': [
      'assign',
      'Publisher languages',
      'New Towns supply all required languages. Planning Units have no publisher locale names from which to generate translations.',
    ],
    'division-hierarchyLookup': [
      'lookup',
      'Parent names',
      'Use the resolved names for each parent Division, including retained translations for missing languages.',
    ],
    'division-divisionLookupInventory': [
      'lookup',
      'Parent Division inventory',
      'Index the publisher Divisions by identity with their effective classes and names.',
    ],
    'division-divisionSupplementedLookup': [
      'combine',
      'Complete the parent inventory',
      'Add required Hong Kong area and city identities that are missing from the publisher inventory.',
    ],
    'division-divisionBaselineI18n': [
      'normalise',
      'Publisher names',
      'Normalise publisher names into separate language-specific values.',
    ],
    'division-divisionAliasI18n': [
      'combine',
      'Name aliases',
      'Apply the declared language and name-suffix alias rules. Keep the primary name unchanged.',
    ],
    'division-divisionCuratedI18n': [
      'select',
      'SaanSeoi curated names',
      'Apply the name decisions that match this Division identity.',
    ],
    'division-effectiveI18n': [
      'select',
      'Corrected names',
      'Apply the name replacements in the matching SaanSeoi curated classification correction.',
    ],
    'division-nativeSelectedInventory': [
      'select',
      'Select settlements',
      'Keep publisher records classified as Settlement for this Division collection.',
    ],
    'division-nativeTranslatedI18n': [
      'combine',
      'Fill missing languages',
      'Use retained translations only for missing languages; do not generate Simplified Chinese through this path.',
    ],
    'division-nativeFinalI18n': [
      'select',
      'Language fallback',
      'For missing languages, use the API’s declared language fallback and preserve the selected name.',
    ],
    'division-nativeBaselineI18n': [
      'select',
      'SaanSeoi curated localised names',
      'Use the accepted names after language-specific alias rules.',
    ],
    'division-nativeVersionTimes': [
      'copy',
      'Published timestamps',
      'Use the timestamps belonging to the exact content version selected by this release.',
    ],
  }
  if (known[code]) return rule(...known[code]!)
  if (code === 'government-area-governmentAreaRows')
    return rule(
      'normalise',
      'Prepare government area geometry',
      symbol === 'normaliseHkgovHadInputRow'
        ? 'Read the HAD district geometry, project HK80 coordinates to WGS 84 and match AREA_ID to the SaanSeoi curated Division identity.'
        : symbol === 'normaliseHkgovPlandNewTownInputRow'
          ? 'Read the New Town polygons in WGS 84. Repair invalid shapes with a zero-distance buffer and match them to their Planning Division identities.'
          : 'Read the registered C&SD geographic layer, project HK80 coordinates to WGS 84 and match the publisher geographic codes to SaanSeoi curated Division identities.',
    )
  if (code === 'division-nativeInventory' || code === 'divisionArea-nativeInventory')
    return rule(
      'normalise',
      'Read native geography',
      symbol === 'readLandsdPlaceNameArchive'
        ? 'Join LandsD place-name geometry to its names by GEO_NAME_ID. Convert HK80 coordinates to WGS 84 and preserve the official and alias names.'
        : 'Read Housing Market Area features, correlate their properties and geometry, project HK80 polygons to WGS 84 and derive stable identities from their HMA codes.',
    )
  if (code === 'government-prepared-field')
    return rule(
      'normalise',
      'Read the publisher component',
      'Read the selected publisher property and normalise its identifier or text using the source-specific field rule.',
    )
  if (
    code.startsWith('government-area-') ||
    /^planning-(id|identifiers|planning_level|hierarchy|division_id|i18n)$/.test(code)
  )
    return rule(
      'copy',
      'Select the prepared field',
      'Read this field from the prepared geographic feature without changing its identity.',
    )
  if (code === 'curated-area-field')
    return rule(
      'copy',
      'SaanSeoi curated area property',
      'Use this property of the SaanSeoi curated area.',
    )
  if (code === 'division-field-curation' || code === 'division-field-patch')
    return rule(
      'select',
      'SaanSeoi curated field replacement',
      'Use the replacement declared for the matching Division identity. Otherwise retain the preceding value.',
    )
  if (
    code === 'division-hierarchy-effectiveClass' ||
    code === 'division-hierarchy-effectiveLevel'
  )
    return rule(
      'lookup',
      'Effective classification',
      'Resolve the publisher class and level using the source’s geographic classification mapping, then apply matching SaanSeoi curated classification decisions.',
    )
  if (
    /^division(?:Area)?-(nativePreparedRow|identifiers|geometry|id|names|sources|source|division_id|district_code|district_class)$/.test(
      code,
    )
  )
    return rule(
      'copy',
      'Select the publisher field',
      'Read this field from the selected native geographic feature, preserving its publisher identity.',
    )
  if (code === 'statistic-reference-period-code')
    return rule(
      'calculate',
      'Reference period',
      'Build the reference-period code from the publisher period fields using this dataset’s period format.',
    )
}
