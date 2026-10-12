import { withRecordSelection } from './fieldLineageRecordSelection'
import { geometryHumanField } from './fieldLineageGeometryHuman'
import {
  geographicFieldRule,
  validateGeographicRule,
  type GeographicRule,
} from './fieldLineageGeographicRules'
/** Reader-facing semantics, separate from executor arguments and record admission checks. */
export type HumanOperation = {
  kind:
    | 'copy'
    | 'calculate'
    | 'select'
    | 'lookup'
    | 'combine'
    | 'normalise'
    | 'assign'
    | 'link'
  /** Other public fields consumed by this operation, shown as navigable references. */
  fieldDependencies?: string[]
  detailRules?: GeographicRule[]
  rule?: GeographicRule
  fieldViews?: Array<{
    fields: string[]
    title: string
    description: string
    inputs?: string[]
    rule?: GeographicRule
  }>
  fieldScope?: { fields: string[]; otherwiseInput: string }
  title: string
  description: string
  /** Only decisions that change this value, never whole-record validation. */
  decisions?: Array<{ when: string; result: string; datasets?: string[] }>
}
const op = (
  kind: HumanOperation['kind'],
  title: string,
  description: string,
  decisions?: HumanOperation['decisions'],
): HumanOperation => ({ kind, title, description, ...(decisions ? { decisions } : {}) })
const curated = 'ds-hk-saanseoi-division'

function baseHumanDivisionField(
  resource: string,
  apiField: string,
  dataset: string,
): HumanOperation | undefined {
  if (!['division', 'divisionArea', 'divisionBoundary'].includes(resource)) return
  const field = apiField.replace(/^attributes\./, '')
  const reviewed = dataset === curated
  if (field === 'geometry')
    return op(
      reviewed ? 'copy' : 'normalise',
      resource === 'division' ? 'Representative point' : 'Geographic shape',
      resource === 'division'
        ? reviewed
          ? 'Use the representative point prepared for this Division. Its source choices are shown below.'
          : 'Use the Division’s representative point. When only an area is available, calculate a point inside it.'
        : 'Use the selected polygon or boundary coordinates in WGS 84. Remove any embedded bounding box; the API provides that separately.',
    )
  if (field === 'createdAt' || field === 'updatedAt')
    return op(
      'copy',
      'Published timestamp',
      'Use the timestamp of the exact content version selected by this release.',
    )
  if (field === 'snapshotId')
    return op(
      'copy',
      'Published collection',
      'Identify the exact collection selected for this API release.',
    )
  if (field === 'divisionCode')
    return op(
      'lookup',
      'Division code',
      'Use the SaanSeoi curated code assignment when supplied; otherwise retain the source code or null.',
    )
  if (field === 'id')
    return op(
      'assign',
      'Stable identity',
      reviewed
        ? 'Use the identity assigned by the SaanSeoi curated source edition.'
        : 'Create the stable SaanSeoi identity from the publisher identity and the source-specific identity rule.',
    )
  if (field === 'level' || field === 'category')
    return op(
      'lookup',
      field === 'level' ? 'Hierarchy level' : 'Division category',
      'Look up the selected Division class in the geographic classification table. The class determines this value.',
    )
  if (field === 'class')
    return op(
      'select',
      'Division class',
      reviewed
        ? 'Use the SaanSeoi curated classification, including accepted classification corrections and island classifications.'
        : 'Map the publisher classification to a SaanSeoi Division class using this source’s classification rules.',
    )
  if (field === 'cartography')
    return op(
      'lookup',
      'Map display settings',
      'Look up the Division class in the cartography policy. It supplies the minimum and maximum display zooms and prominence.',
    )
  if (field === 'hierarchies')
    return op(
      'combine',
      'Parent divisions',
      'Use the SaanSeoi curated parent relationships and expand them into ancestor paths. Containment values describe the final selected areas, rather than publisher naming or classification.',
    )
  if (field.startsWith('i18n.'))
    return op(
      'select',
      field.endsWith('.nameAlts')
        ? 'Alternative names'
        : field.endsWith('.nameRules')
          ? 'Name variants'
          : 'Localised name',
      reviewed
        ? 'Use the name for this language from the SaanSeoi curated edition. Accepted name corrections, aliases and translations contribute only to the corresponding language and name field.'
        : 'Read the publisher’s names for this language, applying this source’s name normalisation and retained translation decisions.',
    )
  if (field.startsWith('identifiers'))
    return op(
      'normalise',
      'Publisher identifiers',
      reviewed
        ? 'Keep the SaanSeoi curated publisher identifiers, grouped by publisher. Wikidata comes from the SaanSeoi curated Wikidata identifier.'
        : 'Keep the identifiers supplied by this publisher and place them under its identifier namespace.',
    )
  if (field === 'sources')
    return op(
      'combine',
      'Source attribution',
      reviewed
        ? 'Keep the SaanSeoi curated source references and their contributions. These describe which sources supplied identity, names, classification, geometry or other properties.'
        : 'Build source references from the publisher’s record identifiers and retained attribution.',
    )
  if (field === 'divisionId')
    return op(
      'link',
      'Owning division',
      'Match this area’s publisher division identity to its SaanSeoi Division identity.',
    )
  if (field === 'leftDivisionId' || field === 'rightDivisionId')
    return op(
      'select',
      field === 'leftDivisionId'
        ? 'First bordering division'
        : 'Second bordering division',
      `Use the ${field === 'leftDivisionId' ? 'first' : 'second'} of the two distinct Division identities supplied with this boundary.`,
    )
  if (field === 'variant')
    return op(
      'assign',
      'Area variant',
      'Use the variant selected for this published area collection; otherwise use the source’s variant.',
    )
  if (field.startsWith('relationships.'))
    return op(
      'link',
      field.endsWith('areas') ? 'Related areas' : 'Related boundaries',
      field.endsWith('areas')
        ? 'Find areas belonging to this Division in the release’s selected area collections.'
        : 'Find boundaries that reference this Division on either side in the release’s selected boundary collection.',
    )
  if (['type', 'isLand', 'isTerritorial'].includes(field))
    return op(
      'select',
      'Land and territorial coverage',
      'Use the source’s land and territorial flags to classify this geometry. The selected field exposes the corresponding flag or combined type.',
    )
}

export type HumanSourceUse = {
  datasetCode: string
  resourceType?: string
  contribution: string
  selection?: GeographicRule
}
const overture = 'ds-hk-overture-division',
  landsd = 'ds-hk-hkgov-landsd-division',
  protomaps = 'ds-hk-protomaps-island'
function baseCuratedPreparationField(
  path: string,
): HumanOperation & { sources: HumanSourceUse[] } {
  const field = path.replace(/^record\./, '')
  const pointSources: HumanSourceUse[] = [
    {
      datasetCode: overture,
      resourceType: 'division',
      contribution: 'Matches the SaanSeoi inventory of Divisions.',
    },
    {
      datasetCode: landsd,
      resourceType: 'division',
      contribution:
        'Locations for selected islands and curated land-based localities, including Wah Fu.',
    },
    {
      datasetCode: protomaps,
      resourceType: 'divisionArea',
      contribution: 'Selected island polygons and the coastline land mask.',
    },
    {
      datasetCode: overture,
      resourceType: 'divisionArea',
      contribution:
        'Territorial polygons for the Division or its configured member districts.',
    },
  ]
  if (field === 'geometry')
    return {
      ...op(
        'select',
        'Choose the representative point',
        'Division.geometry is a representative Point. The polygon and its bbox are published on the selected DivisionArea. Use the curated or publisher point; calculate an interior point only when no point is available.',
        [
          {
            when: 'An accepted Overture Division supplies a point',
            result:
              'Keep its representative point unless a SaanSeoi curated correction replaces it.',
            datasets: [overture],
          },
          {
            when: 'A SaanSeoi curated point or core-point correction is supplied',
            result:
              'Use that point. SaanSeoi curated corrections take precedence over the publisher location.',
          },
          {
            when: 'An island has no SaanSeoi curated point and has a selected LandsD identity',
            result: 'Use the LandsD place-name location.',
            datasets: [landsd],
          },
          {
            when: 'An island has neither a SaanSeoi curated point nor a LandsD point',
            result:
              'Use a point from the selected geometry, or calculate an interior point for its polygon.',
            datasets: [protomaps],
          },
          {
            when: 'A Division has polygonal geometry but no point',
            result:
              'Calculate an interior point from the final selected area. Administrative coverage, island selection, SaanSeoi curated area replacements and island-group geometry determine that area.',
            datasets: [overture, protomaps],
          },
        ],
      ),
      sources: pointSources,
    }
  if (field.startsWith('names.'))
    return {
      ...op(
        'select',
        'Choose the name for this language',
        'Start with the curated name inventory, then apply accepted name corrections and aliases for this language.',
        [
          {
            when: 'The Division comes from the Overture inventory',
            result:
              'Use its accepted publisher names and any retained SaanSeoi curated changes.',
            datasets: [overture],
          },
          {
            when: 'An island has a selected LandsD name',
            result:
              'Prefer its official LandsD name; otherwise use the selected Protomaps name. An explicit curated name overrides either.',
            datasets: [landsd, protomaps],
          },
          {
            when: 'The requested language is Simplified Chinese',
            result:
              'Only an explicit publisher Simplified Chinese name qualifies; do not manufacture it from another locale.',
            datasets: [overture],
          },
        ],
      ),
      sources: [
        {
          datasetCode: overture,
          resourceType: 'division',
          contribution: 'Publisher names in the accepted Division inventory.',
        },
        {
          datasetCode: landsd,
          resourceType: 'division',
          contribution: 'Official names for selected LandsD island identities.',
        },
        {
          datasetCode: protomaps,
          resourceType: 'divisionArea',
          contribution: 'Island names where no official LandsD name is selected.',
        },
      ],
    }
  if (field === 'cartography')
    return {
      ...op(
        'lookup',
        'Look up map display settings',
        'Look up the final Division class in the display policy: minimum zoom, maximum zoom and prominence come from that class.',
      ),
      sources: [],
    }
  if (field === 'class')
    return {
      ...op(
        'select',
        'Determine Division class',
        'Apply accepted classification changes. For individual islands, use an explicit classification where supplied, otherwise classify by the selected polygon’s area. Island groups retain their SaanSeoi curated group classification.',
      ),
      sources: pointSources.filter(source => source.datasetCode !== landsd),
    }
  if (field === 'hierarchies')
    return {
      ...op(
        'combine',
        'Build ancestor paths',
        'Use SaanSeoi curated parent assignments, remove excluded parents, resolve parent identities and expand full ancestor paths. Check containment against the final selected areas.',
      ),
      sources: pointSources.filter(source => source.datasetCode !== landsd),
    }
  if (field === 'identifiers')
    return {
      ...op(
        'combine',
        'Combine publisher identifiers',
        'Combine the accepted Overture identifiers with SaanSeoi curated identity matches. Add a LandsD place-name identifier only for a unique accepted match; this does not imply that LandsD supplied the geometry or name.',
      ),
      sources: [
        {
          datasetCode: overture,
          resourceType: 'division',
          contribution: 'Accepted publisher identifiers.',
        },
        {
          datasetCode: landsd,
          resourceType: 'division',
          contribution:
            'A unique explicit match, or unique name-and-location match within 5 km, supplies the LandsD identifier.',
        },
      ],
    }
  if (field === 'sources')
    return {
      ...op(
        'combine',
        'Describe source contributions',
        'Keep the source references attached to accepted identity, names, classification, hierarchy and geometry choices. A matching external identifier alone does not establish a contribution.',
      ),
      sources: pointSources,
    }
  return {
    ...op(
      'assign',
      'Use the SaanSeoi curated identity',
      'Keep the accepted Overture identity where matched. Otherwise assign a stable identity from the SaanSeoi curated source identity; merge only explicitly SaanSeoi curated aliases.',
    ),
    sources: [
      {
        datasetCode: overture,
        resourceType: 'division',
        contribution: 'Accepted Division identities.',
      },
      {
        datasetCode: landsd,
        resourceType: 'division',
        contribution: 'Selected LandsD island identities.',
      },
      {
        datasetCode: protomaps,
        resourceType: 'divisionArea',
        contribution: 'Selected island identities without a LandsD identity.',
      },
    ],
  }
}

export function validateHumanOperation(
  value: unknown,
): asserts value is HumanOperation {
  const v = value as HumanOperation & { sources?: HumanSourceUse[] }
  if (
    !v ||
    ![
      'copy',
      'calculate',
      'select',
      'lookup',
      'combine',
      'normalise',
      'assign',
      'link',
    ].includes(v.kind) ||
    typeof v.title !== 'string' ||
    !v.title.trim() ||
    typeof v.description !== 'string' ||
    (!v.description.trim() && !v.rule)
  )
    throw Error('Invalid human operation contract')
  if (
    v.fieldDependencies &&
    (!Array.isArray(v.fieldDependencies) ||
      !v.fieldDependencies.length ||
      v.fieldDependencies.some(field => typeof field !== 'string' || !field.trim()))
  )
    throw Error('Invalid field dependencies')
  for (const view of v.fieldViews ?? [])
    if (view.rule) validateGeographicRule(view.rule)
  if (v.rule) validateGeographicRule(v.rule)
  if (v.detailRules) {
    if (!Array.isArray(v.detailRules)) throw Error('Invalid detail rules')
    v.detailRules.forEach(validateGeographicRule)
  }
  if (
    v.fieldScope &&
    (!Array.isArray(v.fieldScope.fields) ||
      !v.fieldScope.fields.length ||
      v.fieldScope.fields.some(field => typeof field !== 'string' || !field.trim()) ||
      typeof v.fieldScope.otherwiseInput !== 'string' ||
      !v.fieldScope.otherwiseInput.trim())
  )
    throw Error('Invalid human operation field scope')
  if (
    v.fieldViews &&
    (!Array.isArray(v.fieldViews) ||
      v.fieldViews.some(
        view =>
          !Array.isArray(view.fields) ||
          !view.fields.length ||
          view.fields.some(field => typeof field !== 'string' || !field) ||
          typeof view.title !== 'string' ||
          !view.title ||
          typeof view.description !== 'string' ||
          !view.description ||
          (view.inputs &&
            (!Array.isArray(view.inputs) ||
              view.inputs.some(input => typeof input !== 'string' || !input))),
      ))
  )
    throw Error('Invalid human field view')
  if (
    v.decisions &&
    (!Array.isArray(v.decisions) ||
      v.decisions.some(
        d =>
          !d ||
          typeof d.when !== 'string' ||
          !d.when.trim() ||
          typeof d.result !== 'string' ||
          !d.result.trim() ||
          (d.datasets &&
            (!Array.isArray(d.datasets) ||
              d.datasets.some(code => typeof code !== 'string'))),
      ))
  )
    throw Error('Invalid human operation decisions')
  if (
    v.sources &&
    (!Array.isArray(v.sources) ||
      v.sources.some(
        s =>
          !s ||
          typeof s.datasetCode !== 'string' ||
          !s.datasetCode ||
          typeof s.contribution !== 'string' ||
          !s.contribution,
      ))
  )
    throw Error('Invalid human operation sources')
  for (const source of v.sources ?? [])
    if (source.selection) validateGeographicRule(source.selection)
}

export function humanDivisionField(
  resource: string,
  apiField: string,
  dataset: string,
): HumanOperation | undefined {
  const geometry = geometryHumanField(resource, apiField, dataset)
  if (geometry) return geometry
  const human = baseHumanDivisionField(resource, apiField, dataset)
  if (!human || resource !== 'division' || dataset !== 'ds-hk-saanseoi-division')
    return human
  const field = apiField.replace(/^attributes\./, '')
  const transformsHere =
    ['category', 'level', 'hierarchies'].includes(field) ||
    field.startsWith('relationships.')
  const rule = transformsHere ? geographicFieldRule(apiField) : undefined
  return {
    ...human,
    ...(!transformsHere
      ? {
          kind: 'copy' as const,
          description:
            'Use the prepared value for this field from the pinned source release.',
        }
      : {}),
    ...(rule ? { rule } : {}),
  }
}

export function curatedPreparationField(
  path: string,
): HumanOperation & { sources: HumanSourceUse[] } {
  let human = baseCuratedPreparationField(path)
  if (path === 'record.class')
    human = {
      ...human,
      sources: [
        {
          datasetCode: overture,
          resourceType: 'division',
          contribution:
            'Use the referenced Overture record’s subtype and class in the mapping above.',
        },
        {
          datasetCode: protomaps,
          resourceType: 'divisionArea',
          contribution:
            'Selected island area used for size classification when no SaanSeoi curated class applies.',
        },
      ],
    }
  if (path === 'record.hierarchies')
    human = {
      ...human,
      description:
        'Build ancestry using the assembled SaanSeoi DivisionAreas, including hand-drawn polygons. Use the Division’s representative point only when it has no area.',
      sources: [],
    }
  if (path === 'record.identifiers.wikidata.id')
    human = {
      kind: 'copy',
      title: 'Retain the Wikidata link',
      description:
        'Use the accepted publisher or SaanSeoi curated Wikidata Q identifier.',
      sources: [
        {
          datasetCode: overture,
          resourceType: 'division',
          contribution:
            'Publisher Wikidata link, subject to SaanSeoi curated identity corrections.',
        },
      ],
    }
  const rule = geographicFieldRule(path, true)
  const { decisions, ...rest } = human
  const result = rule ? { ...rest, rule } : human
  return { ...result, sources: withRecordSelection(result.sources, path) }
}
