import type { HumanOperation, HumanSourceUse } from './fieldLineageHuman'
import type { GeographicRule } from './fieldLineageGeographicRules'

const table = (columns: string[], rows: string[][]): GeographicRule => ({
  kind: 'mapping',
  columns,
  rows,
})
const sequence = (...steps: string[]): GeographicRule => ({ kind: 'sequence', steps })
const operation = (
  title: string,
  rule: GeographicRule,
  description = '',
  kind: HumanOperation['kind'] = 'calculate',
): HumanOperation => ({ title, rule, description, kind })
export const geometryTypeRule: GeographicRule = {
  kind: 'priority',
  branches: [
    { when: 'Land and territorial are both true', value: 'mixed' },
    { when: 'Otherwise, publisher class is land', value: 'land' },
    { when: 'Otherwise, publisher class is maritime', value: 'maritime' },
    { when: 'Neither class applies', value: 'Reject the geometry' },
  ],
}

export function geometryHumanField(
  resource: string,
  apiField: string,
  dataset: string,
): HumanOperation | undefined {
  if (!['divisionArea', 'divisionBoundary'].includes(resource)) return
  const field = apiField.replace(/^attributes\./, '')
  const government = /hkgov-(had|censtatd|pland)/.test(dataset)
  const reviewed = dataset === 'ds-hk-saanseoi-division'
  if (field === 'bbox')
    return operation(
      'Bounding box',
      table(
        ['Coordinate', 'From this geometry'],
        [
          ['West', 'Minimum longitude'],
          ['South', 'Minimum latitude'],
          ['East', 'Maximum longitude'],
          ['North', 'Maximum latitude'],
        ],
      ),
    )
  if (field === 'geometry')
    return operation(
      resource === 'divisionArea' ? 'Area polygons' : 'Boundary lines',
      sequence(
        resource === 'divisionArea'
          ? 'Selected Polygon / MultiPolygon'
          : 'Selected LineString / MultiLineString',
        'Keep WGS 84 coordinates',
        'Return geometry without embedded bounds',
      ),
      '',
      'copy',
    )
  if (field === 'type')
    return operation('Coverage type', geometryTypeRule, '', 'select')
  if (field === 'isLand' || field === 'isTerritorial')
    return operation(
      field === 'isLand' ? 'Land coverage' : 'Territorial coverage',
      government
        ? table(['Government area policy', 'Value'], [[field, 'true']])
        : table(
            ['Source value', 'API value'],
            [
              ['true', 'true'],
              ['false', 'false'],
              ['Absent or not a boolean', 'null'],
            ],
          ),
      '',
      government ? 'assign' : 'normalise',
    )
  if (field === 'leftDivisionId' || field === 'rightDivisionId')
    return operation(
      'Bordering Division',
      table(
        ['Publisher’s pair', field],
        [
          [
            field === 'leftDivisionId' ? 'First Division ID' : 'Second Division ID',
            'Keep the supplied identity',
          ],
        ],
      ),
      'The publisher supplies two distinct identities. Their order is retained; no geographic left/right calculation is performed.',
      'link',
    )
  if (field === 'divisionId')
    return operation(
      'Owning Division',
      sequence('Prepared area’s Division ID', 'Same Division ID in the API'),
      '',
      'link',
    )
  if (field === 'id')
    return operation(
      resource === 'divisionArea' ? 'Area identity' : 'Boundary identity',
      sequence(
        reviewed
          ? 'Prepared SaanSeoi area ID'
          : 'Publisher geometry ID + source namespace',
        reviewed
          ? 'Keep the prepared ID'
          : `Stable ${resource === 'divisionArea' ? 'area' : 'boundary'} ID`,
      ),
      '',
      'assign',
    )
  if (field === 'variant')
    return operation(
      'Area variant',
      {
        kind: 'priority',
        branches: [
          {
            when: 'Collection specifies a variant',
            value: 'Use the collection variant',
          },
          { when: 'No collection variant', value: 'Use the source name' },
        ],
      },
      '',
      'assign',
    )
  if (field === 'identifiers')
    return operation(
      'Publisher identifiers',
      sequence('Publisher feature identity', 'Group under the publisher namespace'),
      '',
      'normalise',
    )
  if (field === 'sources')
    return operation(
      'Geometry attribution',
      sequence(
        reviewed
          ? 'Prepared references to contributing shapes and SaanSeoi curated selections'
          : 'Publisher record references and attribution',
        'Retain source identities and contributions',
      ),
      '',
      'copy',
    )
}

export function geometryHumanProducer(
  code: string,
  spec: Record<string, unknown>,
): (HumanOperation & { sources?: HumanSourceUse[] }) | undefined {
  if (code === 'division-geometry-type')
    return operation('Coverage type', geometryTypeRule, '', 'select')
  if (
    code === 'simplified-area-display' &&
    String(spec.expression).startsWith('calculateGeoJsonBbox')
  )
    return {
      ...geometryHumanField('divisionArea', 'bbox', '')!,
      fieldDependencies: ['geometry'],
    }
  if (code === 'simplified-area-display')
    return operation(
      'Simplified area',
      sequence(
        'All neighbouring areas as one coverage',
        `Simplify shared boundaries · ${Number(spec.toleranceMetres ?? 10)} m tolerance`,
        'Keep each area’s identity',
        'Recalculate bounds',
      ),
      'Calculations use a local metre-based projection. The original publisher geometry is retained separately.',
    )
  if (code === 'normalised-government-area-coverage')
    return operation(
      'Neighbouring area coverage',
      sequence(
        'All areas in the selected government collection',
        'One coverage with a stable area-to-shape association',
      ),
      '',
      'combine',
    )
  if (code === 'government-area-governmentAreaRows') {
    const symbol = (spec.implementation as { symbol?: string })?.symbol
    const had = symbol === 'normaliseHkgovHadInputRow'
    const town = symbol === 'normaliseHkgovPlandNewTownInputRow'
    const selection = table(
      ['Select records', 'Match'],
      had
        ? [
            ['Layer', 'DCD'],
            ['Native ↔ projected feature', 'Same AREA_ID'],
          ]
        : town
          ? [
              ['Feature', 'Publisher New Town identity'],
              [
                'Division owner',
                'Source edition + normalised English name → stable Division ID',
              ],
            ]
          : [
              ['Layer', 'Registered layer for the pinned source edition'],
              [
                'Reference period',
                'Publisher period = selected cohort, where the layer has a period field',
              ],
              [
                'Division owner',
                'Supplied division_id; otherwise district class, then district code → curated identity mapping',
              ],
            ],
    )
    return {
      ...operation('Select publisher area records', selection, '', 'lookup'),
      detailRules: spec.sourceProfiles
        ? [
            table(
              ['Source edition', 'Layer', 'Period field'],
              Object.entries(
                spec.sourceProfiles as Record<
                  string,
                  { layerName: string; referencePeriodField?: string }
                >,
              ).map(([edition, profile]) => [
                edition,
                profile.layerName,
                profile.referencePeriodField ?? 'All features',
              ]),
            ),
          ]
        : [],
      fieldViews: [
        {
          fields: ['geometry', 'bbox'],
          title: 'Preprocess publisher artefact',
          description: 'Retain the publisher geometry alongside the prepared shape.',
          rule: sequence(
            had
              ? 'DCD polygons matched by AREA_ID'
              : town
                ? 'New Town polygons'
                : 'Registered C&SD layer; matching reference period',
            town ? 'WGS 84; repair invalid shapes with buffer(0)' : 'HK80 → WGS 84',
          ),
        },
      ],
    }
  }
  if (code.startsWith('government-area-') && code !== 'government-area-geometry') {
    const field = code.slice('government-area-'.length)
    const symbol = (spec.implementation as { symbol?: string })?.symbol
    const had = symbol === 'normaliseHkgovHadInputRow'
    if (!had && symbol !== 'normaliseHkgovCenstatdInputRow') return
    if (field === 'division_id')
      return operation(
        'Match the owning Division',
        {
          kind: 'priority',
          branches: had
            ? [
                {
                  when: 'AREA_ID has a curated identity match',
                  value: 'Canonical Division ID',
                },
                { when: 'Otherwise', value: 'Reject the unmatched area' },
              ]
            : [
                {
                  when: 'Publisher supplies a Division ID',
                  value: 'Keep that Division ID',
                },
                {
                  when: 'Otherwise, district class exists',
                  value: 'Match district class to curated Division ID',
                },
                {
                  when: 'Otherwise, district code exists',
                  value: 'Match district code to curated Division ID',
                },
                { when: 'Otherwise', value: 'Reject the unmatched area' },
              ],
        },
        'An unmatched selected key rejects the area; it does not try a lower-priority key.',
        'lookup',
      )
    if (field === 'id')
      return operation(
        'Publisher area identity',
        {
          kind: 'priority',
          branches: [
            { when: 'Prepared publisher ID exists', value: 'Keep that ID' },
            ...(!had
              ? [
                  {
                    when: 'Otherwise, supplied Division ID exists',
                    value: 'CENSTATD: + Division ID',
                  },
                  {
                    when: 'Otherwise, district class exists',
                    value: 'CENSTATD: + district class',
                  },
                ]
              : []),
            {
              when: 'Otherwise',
              value: had ? 'HAD: + AREA_ID' : 'CENSTATD: + district code',
            },
          ],
        },
        '',
        'assign',
      )
    if (field === 'sources')
      return operation(
        'Publisher attribution',
        sequence(
          'Selected publisher feature',
          'Retain dataset, native feature ID and archive reference',
        ),
        '',
        'copy',
      )
  }
  if (code !== 'curated-area-prepared-field') return
  const field = String(spec.outputPath)
  if (field === 'geometry' || field === 'bbox')
    return {
      ...operation(
        'Prepare SaanSeoi area',
        table(
          ['Area', 'Shape source'],
          [
            [
              'SAR / district territory',
              'Union selected Overture territorial polygons',
            ],
            ['Administrative area territory', 'Union its configured member districts'],
            [
              'Administrative land',
              'Intersect territory with Protomaps coastline land',
            ],
            ['Island with a geometry override', 'Curated Override'],
            [
              'Otherwise, selected island polygon exists',
              'Protomaps polygon matched by sourceRecordId',
            ],
            [
              'SaanSeoi curated estimated area',
              'Replace the non-administrative area with the SaanSeoi curated polygon',
            ],
            ['Island group', 'Union selected whole-island polygons'],
            [
              'Otherwise, Overture area matches the Division ID',
              'Keep the matching Overture area',
            ],
          ],
        ),
        'SaanSeoi curated estimated areas replace island selections where both apply. Island-group unions are applied last. Bounds are calculated from each output shape.',
        'select',
      ),
      detailRules: [
        sequence(
          'Island-group seed bounds select fully contained islands',
          'Add explicit inclusions; remove explicit exclusions',
          'Union whole polygons without clipping to the seed bounds',
        ),
        sequence(
          'Large administrative output: split existing polygon components into parts',
          'Preserve coordinates and holes',
          'Calculate bounds separately for each part',
        ),
      ],
      sources: [
        {
          datasetCode: 'ds-hk-overture-division',
          resourceType: 'divisionArea',
          contribution: 'Territorial polygons and retained base areas.',
        },
        {
          datasetCode: 'ds-hk-protomaps-island',
          resourceType: 'divisionArea',
          contribution: 'Coastline land mask and selected island polygons.',
        },
      ],
    }
  if (['class', 'is_land', 'is_territorial'].includes(field))
    return operation(
      'Prepared coverage',
      {
        kind: 'priority',
        branches: [
          {
            when: 'Administrative territory; all contributing territories are land',
            value: field === 'class' ? 'mixed' : 'true',
          },
          {
            when: 'Administrative territory; at least one contributor is not land',
            value:
              field === 'class' ? 'maritime' : field === 'is_land' ? 'false' : 'true',
          },
          {
            when: 'Clipped land, island, estimated area or island group',
            value: field === 'class' ? 'land' : field === 'is_land' ? 'true' : 'false',
          },
          {
            when: 'Otherwise, retained Overture area',
            value:
              'Overture ' +
              (field === 'class'
                ? 'coverage type'
                : field === 'is_land'
                  ? 'land flag'
                  : 'territorial flag'),
          },
        ],
      },
      '',
      'assign',
    )
  if (field === 'division_id')
    return operation(
      'Area owner',
      sequence(
        'SaanSeoi curated Division identity',
        'Attach each prepared area to that Division',
      ),
      '',
      'link',
    )
  if (field === 'id')
    return operation(
      'Prepared area identity',
      sequence(
        'Identity of the retained or constructed area',
        'Stable ID in the SaanSeoi namespace',
      ),
      '',
      'assign',
    )
  if (field === 'sources')
    return operation(
      'Contributing sources',
      table(
        ['Construction', 'Attribution'],
        [
          ['Territory', 'Overture polygons'],
          ['Clipped land', 'Overture territory + Protomaps coastline'],
          ['Selected island', 'SaanSeoi curated selection + Protomaps polygon'],
          ['SaanSeoi curated polygon', 'SaanSeoi curated geometry'],
          ['Island group', 'SaanSeoi curated group + selected member IDs'],
        ],
      ),
      '',
      'combine',
    )
  if (field === 'identifiers')
    return operation(
      'Prepared identifiers',
      sequence(
        'Owning Division’s identifiers',
        'Merge SaanSeoi curated island identifiers where supplied',
      ),
      '',
      'combine',
    )
}
