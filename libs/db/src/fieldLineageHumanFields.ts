import { humanDivisionField, type HumanOperation } from './fieldLineageHuman'
const words = (value: string) =>
  value
    .replace(/^attributes\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('.', ' · ')
const rule = (
  kind: HumanOperation['kind'],
  title: string,
  description: string,
): HumanOperation => ({ kind, title, description })

/** Field contracts mirror the explicit branches in fieldLineageCurrentRules. */
export function humanField(
  resource: string,
  apiField: string,
  dataset: string,
): HumanOperation | undefined {
  const division = humanDivisionField(resource, apiField, dataset)
  if (division) return division
  const field = apiField.replace(/^attributes\./, '')
  const label = words(field)
  if (resource === 'statistic-field') {
    const descriptions: Record<string, string> = {
      aggregation:
        'Use the SaanSeoi curated aggregation method; otherwise mark it unreviewed.',
      statisticKind:
        'Use the SaanSeoi curated statistic kind; otherwise mark it unreviewed.',
      fieldName:
        'Use the SaanSeoi curated field name, falling back to the publisher column name.',
      measureCode:
        'Use the SaanSeoi curated measure code, falling back to the field name.',
      unitCode:
        'Use the SaanSeoi curated unit, otherwise the dataset’s unit mapping for this publisher column.',
      valueKind:
        'Treat the field as numeric when any accepted observation is numeric or non-published, or the SaanSeoi curated definition declares it numeric.',
      i18n: 'Use the SaanSeoi curated language-specific labels. Without them, use the publisher column name as the English label.',
      versionHash:
        'Hash the field definition, its language-specific labels and the referenced measure definition. Sort language labels before hashing; publication timestamps do not affect this identity.',
      sourceField: 'Keep the publisher column name.',
      datasetCode: 'Keep the owning dataset code.',
      dimensions:
        'Use the SaanSeoi curated dimension definitions; otherwise return an empty object.',
    }
    return rule(
      field === 'versionHash' ? 'calculate' : 'lookup',
      label,
      descriptions[field] ??
        `Read ${label} from the SaanSeoi provided field definition. Return null when it is not supplied.`,
    )
  }
  if (resource === 'statistic') {
    if (field.startsWith('values.'))
      return rule(
        'select',
        'Observation value',
        'Select this field’s converted observation from the record for the requested geography and reference period.',
      )
    const descriptions: Record<string, string> = {
      id: 'Use the stable identity created from the dataset, geography and reference period.',
      geography:
        'Use the publisher geography and its SaanSeoi curated mapping to the published geography.',
      comparability:
        'Read comparability from the exact field definition associated with each observation; omit fields without a comparability definition.',
      fieldSources:
        'Retain source entries with an empty property as the default and /values/{field} JSON Pointer overrides for each value’s last change.',
      fieldDefinitionHashes:
        'Keep the content identity of the exact definition used for each observation.',
      'relationships.division':
        'Link the observation to the Division selected by the SaanSeoi curated geography mapping.',
      sourceReleaseId:
        'Identify the exact publisher release supplying this observation.',
      datasetCode: 'Identify the dataset owning this observation.',
    }
    return rule(
      'select',
      label,
      descriptions[field] ??
        (field.startsWith('referencePeriod.')
          ? 'Use this component of the reference period derived from the publisher’s period fields and the dataset’s period rule.'
          : 'Use the selected observation’s field value.'),
    )
  }
  if (resource === 'address') {
    if (field.includes('buildingNumber'))
      return rule(
        'select',
        'Building number',
        'Use street numbers when a street name exists; otherwise use village numbers. Trim empty components to null. A single-number expression is available only when the start exists and the end is absent or equal.',
      )
    if (/\.block/.test(field))
      return rule(
        'normalise',
        'Block component',
        'Normalise the block descriptor and reference. English places the descriptor before the reference; Chinese places it after the reference. Read the requested component from that result.',
      )
    if (/\.phase/.test(field))
      return rule(
        'normalise',
        'Phase component',
        'Prefer the prepared phase name and reference over the publisher address’s phase fields. Separate recognised phase suffixes and numeric or Roman-numeral references; combine the non-empty components for the phase expression.',
      )
    if (field.startsWith('i18n.'))
      return rule(
        'copy',
        label,
        'Use this language’s prepared address component, trimming empty text to null. The language is included only when it has a formatted address.',
      )
    const descriptions: Record<string, string> = {
      id: 'Prefer the SaanSeoi curated canonical identity, otherwise the source address identity.',
      geometry:
        'Use the prepared address coordinates after any applicable SaanSeoi curated coordinate correction.',
      parentAddressId:
        'Use the accepted parent-address identity; return null when there is no parent.',
      granularity:
        'Use an explicit SaanSeoi curated hierarchy classification when supplied; otherwise derive the address level from its identity and address components.',
      'relationships.divisions':
        'Link the address to the Divisions selected by its location and accepted address geography, using the release’s exact Division collection.',
      sources:
        'Keep the publisher address references and the accepted source contributions.',
      i18n: 'Build English and Traditional Chinese address components separately and key them by language.',
    }
    return rule(
      'select',
      label,
      descriptions[field] ??
        (field.startsWith('identifiers.')
          ? 'Read the requested publisher identifier from the prepared address identifiers.'
          : 'Use the selected address component.'),
    )
  }
  if (resource === 'place') {
    if (field.startsWith('i18n.'))
      return rule(
        'normalise',
        label,
        'Select this language’s publisher name or address component. Resolve publisher language keys and infer the language from the script only when needed.',
      )
    const descriptions: Record<string, string> = {
      id: 'Keep the publisher Place identity.',
      geometry:
        'Use accepted resolution coordinates where supplied; otherwise use the publisher longitude and latitude for each missing coordinate.',
      referenceName:
        'Prefer the Traditional Chinese name with a distinct non-Han English name where appropriate; otherwise English, then the first non-empty language, then null.',
      firstSeenMonth:
        'Preserve the identity’s first-seen month; for a new identity, use the source release month.',
      lastSeenMonth: 'Use the month of the selected completed publication.',
      sources:
        'Use the resolved publisher attribution. Preserve existing attribution when the Place content is unchanged.',
      'taxonomy.primary':
        'Prefer the publisher taxonomy’s primary category, otherwise its primary category field.',
      'taxonomy.alternates':
        'Use alternate categories, falling back to alternate taxonomy values.',
      basicCategory:
        'Prefer the publisher basic category; otherwise use its primary taxonomy category.',
      'relationships.address':
        'Link to the accepted matching Address, or return null when none was accepted.',
      'relationships.divisions':
        'Use the distinct Division identities from the accepted Place and Address association.',
    }
    return rule(
      'select',
      label,
      descriptions[field] ??
        (field.startsWith('address')
          ? 'Use the accepted address association and its exact companion release; return null when no applicable association exists.'
          : 'Use this property of the selected published Place.'),
    )
  }
}
