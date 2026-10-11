import { formatReleaseStat } from './releaseStatsFormat'
import { createPlaceProfile } from './placeProfile'
import { createStatisticsProfile } from './statisticsProfile'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
  ReleaseStatsMeasure,
  ReleaseStatsPresentation,
  LocaleCoveragePresentation,
} from './releaseStats.types'

type Row = ReleaseStat & { index: number }
const qualityDescriptions: Record<string, string> = {
  parent_changed_count:
    'Records present in both releases whose parent division changed, including a parent being added or removed. This is a structural change, not necessarily an error.',
  locale_regression_count:
    'Records present in both releases that lost at least one previously available language locale. Each record is counted once, even if several locales disappeared.',
  name_regression_count:
    'Records present in both releases where a previously tracked primary or alternate name is no longer listed in the same locale. Inferred primary names are excluded. Each record is counted once; a renamed record can also trigger this check.',
  geometry_changed_count:
    'Records present in both releases whose stored geometry differs, including geometry being added or removed. This compares stored geometry, so coordinate ordering changes can also count; it does not necessarily indicate an error or a change in shape.',
}
const valueFor = (rows: Row[], category: string, measure: string) =>
  rows.find(row => row.category === category && row.measure === measure)?.value
const sectionId = (value: string) =>
  `stats-${
    value
      .replaceAll(/[^a-zA-Z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .toLowerCase() || 'summary'
  }`

export function createReleaseStatsPresentation({
  resourceType,
  isFirstRelease = false,
  stats,
  districtAreas = [],
  districtNames = [],
  measures = [],
  locale,
  copy,
}: {
  resourceType?: string
  isFirstRelease?: boolean
  stats?: ReleaseStat[]
  districtAreas?: ReleaseStatsDistrictArea[]
  districtNames?: ReleaseStatsDistrictName[]
  measures?: ReleaseStatsMeasure[]
  locale: string
  copy: ReleaseStatsCopy
}): ReleaseStatsPresentation {
  const statistics =
    resourceType === 'divisionStatistic' && stats?.length
      ? createStatisticsProfile(stats, locale, copy)
      : undefined
  const places =
    resourceType === 'place' && stats?.length
      ? createPlaceProfile(stats, locale, copy)
      : undefined
  const rows = (
    places?.remainingStats ??
    statistics?.remainingStats ??
    stats ??
    []
  ).map((stat, index) => ({
    ...stat,
    index,
  }))
  const claimed = new Set<number>()
  const claim = (selected: Row[]) => {
    selected.forEach(row => {
      claimed.add(row.index)
    })
  }
  const matching = (predicate: (row: Row) => boolean) => rows.filter(predicate)
  const headings: ReleaseStatsPresentation['headings'] = []
  const headingIds = new Set<string>()
  const addHeading = (baseId: string, label: string) => {
    let id = baseId
    let suffix = 2
    while (headingIds.has(id)) id = `${baseId}-${suffix++}`
    headingIds.add(id)
    headings.push({ id, level: 2, label })
    return id
  }

  if (statistics) {
    if (statistics.profile.coverage)
      addHeading('stats-profile-coverage', 'Field coverage')
    if (statistics.profile.availability.length)
      addHeading('stats-profile-availability', 'Value availability')
    statistics.profile.distributions.forEach(group => {
      addHeading(group.id, group.title)
    })
  }

  const churn = matching(row => row.category === 'changes' && !row.dimension)
  const total = valueFor(churn, 'changes', 'count')
  const baselineRecords =
    isFirstRelease && total === undefined
      ? stats?.find(
          row =>
            row.category === 'records' && row.measure === 'count' && !row.dimension,
        )?.value
      : undefined
  const churnValue = (category: string) =>
    valueFor(churn, 'changes', category) ??
    (category === 'added_count' ? (baselineRecords ?? 0) : 0)
  const primaryRecords = matching(
    row => row.category === 'records' && row.measure === 'count' && !row.dimension,
  )[0]
  const fallback = matching(
    row =>
      row.category === 'records' &&
      row.measure === 'count' &&
      (row.dimension === 'table' || row.dimension === 'source'),
  )[0]
  const overview =
    (stats?.length ?? 0) > 0
      ? (() => {
          if (total !== undefined) claim(churn)
          if (primaryRecords) claim([primaryRecords])
          if (fallback && !primaryRecords && fallback.dimension !== 'table')
            claim([fallback])
          const metrics = (
            [
              ['added_count', 'added', copy.labels.added],
              ['changed_count', 'changed', copy.labels.changed],
              ['removed_count', 'removed', copy.labels.removed],
              ['unchanged_count', 'unchanged', copy.labels.unchanged],
            ] as const
          ).map(([category, key, label]) => ({
            key,
            label,
            value: churnValue(category),
            formattedValue:
              valueFor(churn, 'changes', category) === undefined &&
              baselineRecords === undefined
                ? '—'
                : formatReleaseStat(locale, churnValue(category)),
          }))
          addHeading(
            'stats-overview',
            statistics
              ? 'Statistics overview'
              : (copy.labels.overview ?? copy.labels.dataset),
          )
          if (statistics) headings.unshift(...headings.splice(headings.length - 1, 1))
          return {
            recordCount: formatReleaseStat(
              locale,
              total ??
                primaryRecords?.value ??
                fallback?.value ??
                stats?.find(
                  row =>
                    row.category === 'records' &&
                    row.measure === 'count' &&
                    !row.dimension,
                )?.value ??
                0,
            ),
            churn: {
              unavailable:
                total === undefined &&
                baselineRecords === undefined &&
                churn.length === 0,
              baseline:
                baselineRecords !== undefined ||
                ((metrics[0]?.value ?? 0) > 0 &&
                  metrics.slice(1).every(measure => measure.value === 0)),
              metrics,
            },
          }
        })()
      : undefined

  if (places) {
    if (places.profile.metrics.length)
      addHeading('stats-place-overview', 'Place coverage')
    if (places.profile.fields.length)
      addHeading('stats-place-languages', 'Language coverage')
  }

  const districtRows = matching(
    row =>
      row.measure === 'count' &&
      row.category === 'records' &&
      row.dimension === 'district' &&
      Boolean(row.dimensionValue),
  )
  claim(districtRows)
  const districtDistribution =
    districtAreas.length && districtRows.length
      ? (() => {
          addHeading('stats-records-by-district', copy.labels.recordsByDistrict)
          return {
            features: districtAreas.map(area => ({
              id: area.divisionId,
              geometry: area.geometry,
              label: area.name ?? copy.labels.district,
            })),
            values: districtRows.map(row => ({
              id: row.dimensionValue ?? '',
              value: row.value,
            })),
          }
        })()
      : undefined

  const geometryRows = matching(
    row =>
      row.category === 'geometry' &&
      row.dimension === 'district' &&
      Boolean(row.dimensionValue),
  )
  const geometry = geometryRows.length
    ? (() => {
        const districts = new Map<string, Row[]>()
        geometryRows.forEach(row => {
          const districtId = row.dimensionValue
          if (districtId)
            districts.set(districtId, [...(districts.get(districtId) ?? []), row])
        })
        const districtsById = new Map(
          districtAreas.map(area => [
            area.divisionId,
            { name: area.name, unofficial: false },
          ]),
        )
        for (const district of districtNames) {
          districtsById.set(district.divisionId, {
            name: district.name,
            unofficial: district.unofficial,
          })
        }
        const result = [...districts]
          .map(([districtId, districtRows]) => {
            const featureCount = valueFor(districtRows, 'geometry', 'feature_count')
            const boundarySegmentCount = valueFor(
              districtRows,
              'geometry',
              'boundary_segment_count',
            )
            const boundaryLength = valueFor(districtRows, 'geometry', 'boundary_length')
            if (
              featureCount === undefined ||
              boundarySegmentCount === undefined ||
              boundaryLength === undefined
            )
              return undefined
            const polygonCount = valueFor(districtRows, 'geometry', 'polygon_count')
            const area = valueFor(districtRows, 'geometry', 'area')
            const district = districtsById.get(districtId)
            return {
              districtId,
              label: district?.name ?? copy.districtFallback(districtId),
              unofficial: district?.unofficial ?? false,
              featureCount: formatReleaseStat(locale, featureCount),
              featureCountValue: featureCount,
              boundarySegmentCount: formatReleaseStat(locale, boundarySegmentCount),
              ...(polygonCount === undefined
                ? {}
                : { polygonCount: formatReleaseStat(locale, polygonCount) }),
              ...(area === undefined
                ? {}
                : { area: formatReleaseStat(locale, area, 'square_kilometres') }),
              boundaryLength: formatReleaseStat(locale, boundaryLength, 'kilometres'),
            }
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .sort(
            (left, right) =>
              left.label.localeCompare(right.label, locale) ||
              left.districtId.localeCompare(right.districtId),
          )
        if (!result.length) return undefined
        claim(geometryRows)
        return {
          id: addHeading('stats-geometry-statistics', copy.labels.geometry),
          map: (() => {
            const rowByDistrict = new Map(result.map(row => [row.districtId, row]))
            const features = districtAreas.flatMap(area => {
              const row = rowByDistrict.get(area.divisionId)
              return row && area.geometry.coordinates.length
                ? [
                    {
                      id: area.divisionId,
                      geometry: area.geometry,
                      label: row.label,
                    },
                  ]
                : []
            })
            return features.length
              ? {
                  features,
                  values: features.map(feature => ({
                    id: feature.id,
                    value: rowByDistrict.get(feature.id)?.featureCountValue ?? 0,
                  })),
                }
              : undefined
          })(),
          rows: result,
          showArea: result.some(row => row.area !== undefined),
          showFeatureCount: new Set(result.map(row => row.featureCountValue)).size > 1,
          showPolygonCount: result.some(row => row.polygonCount !== undefined),
        }
      })()
    : undefined

  const localeRows = matching(
    row =>
      row.category === 'completeness' &&
      row.dimension === 'locale' &&
      Boolean(row.dimensionValue),
  )
  const localeCoverage = localeRows.length
    ? (() => {
        const groups = new Map<string, Row[]>()
        localeRows.forEach(row => {
          const dimensionValue = row.dimensionValue
          if (dimensionValue) {
            groups.set(dimensionValue, [...(groups.get(dimensionValue) ?? []), row])
          }
        })
        const result = [...groups]
          .map(([code, group]) => {
            const coverage = valueFor(group, 'completeness', 'locale_coverage') ?? 0
            const provenanceDimensions = [
              { tone: 'provided', category: 'locale_coverage_provided' },
              { tone: 'inferred', category: 'locale_coverage_inferred' },
              { tone: 'ai-translated', category: 'locale_coverage_ai_translated' },
              {
                tone: 'human-translated',
                category: 'locale_coverage_human_translated',
              },
            ] as const
            const hasProvenanceBreakdown = group.some(row =>
              provenanceDimensions.some(({ category }) => row.measure === category),
            )
            const segments: LocaleCoveragePresentation[number]['segments'] =
              provenanceDimensions.flatMap(({ tone, category }) => {
                const value = valueFor(group, 'completeness', category) ?? 0
                return value > 0 ? [{ label: tone, tone, value }] : []
              })
            const localeSegments: LocaleCoveragePresentation[number]['segments'] =
              !hasProvenanceBreakdown && coverage > 0
                ? [{ label: 'provided', tone: 'provided', value: coverage }]
                : segments
            return {
              code,
              label: copy.localeName(code),
              count: formatReleaseStat(
                locale,
                valueFor(group, 'completeness', 'locale_count') ?? 0,
              ),
              coverage,
              coverageLabel: formatReleaseStat(locale, coverage, 'percentage'),
              segments: localeSegments,
            }
          })
          .sort((a, b) => b.coverage - a.coverage)
        if (!result.length) return undefined
        claim(localeRows)
        addHeading('stats-names-by-locale', copy.labels.namesByLocale)
        return result
      })()
    : undefined

  const componentRows = matching(
    row =>
      row.category === 'completeness' &&
      row.measure === 'component_coverage' &&
      row.dimension === 'addressComponent' &&
      Boolean(row.dimensionValue),
  )
  const componentCoverage = componentRows.length
    ? (() => {
        claim(componentRows)
        addHeading('stats-address-components', copy.labels.addressComponents)
        return componentRows
          .map(row => ({
            label: copy.statLabel(row.dimensionValue),
            value: row.value,
            formattedValue: formatReleaseStat(
              locale,
              row.value,
              row.unit ?? 'percentage',
            ),
          }))
          .sort((a, b) => b.value - a.value)
      })()
    : undefined

  const divisionLinkageRows = matching(
    row =>
      row.category === 'records' &&
      row.measure === 'linkage' &&
      row.dimension === 'divisionLevel' &&
      Boolean(row.dimensionValue),
  )
  const divisionLinkage = divisionLinkageRows.length
    ? (() => {
        claim(divisionLinkageRows)
        const linkageTotal = primaryRecords?.value ?? fallback?.value ?? total ?? 0
        const divisionLevelOrder = ['area', 'district', 'street']
        return {
          id: addHeading('stats-division-linkage', 'Divisions & Streets'),
          rows: divisionLinkageRows
            .map(row => ({
              order: divisionLevelOrder.indexOf(row.dimensionValue ?? ''),
              label: copy.statLabel(row.dimensionValue),
              value: formatReleaseStat(locale, row.value, row.unit),
              coverageLabel: formatReleaseStat(
                locale,
                linkageTotal > 0 ? Math.min(100, (row.value / linkageTotal) * 100) : 0,
                'percentage',
              ),
            }))
            .sort(
              (left, right) =>
                left.order - right.order ||
                left.label.localeCompare(right.label, locale),
            )
            .map(({ order: _order, ...row }) => row),
        }
      })()
    : undefined

  claim(
    matching(
      row =>
        !row.dimension &&
        ((row.category === 'observations' && row.measure === 'count') ||
          (row.category === 'measures' && row.measure === 'count') ||
          (row.category === 'fields' && row.measure === 'count') ||
          (row.category === 'reference_periods' && row.measure === 'count') ||
          (row.category === 'dimensions' &&
            ['definition_count', 'value_definition_count'].includes(
              row.measure ?? '',
            ))),
    ),
  )

  const measureRows = matching(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'measure' &&
      Boolean(row.dimensionValue),
  )
  const measureCoverage = measureRows.length
    ? (() => {
        const counts = new Map<number, Row[]>()
        measureRows.forEach(row => {
          counts.set(row.value, [...(counts.get(row.value) ?? []), row])
        })
        const [baseline, baselineRows] =
          [...counts].sort(
            ([leftValue, leftRows], [rightValue, rightRows]) =>
              rightRows.length - leftRows.length || rightValue - leftValue,
          )[0] ?? []
        if (baseline === undefined || !baselineRows) return undefined
        claim(measureRows)
        const exceptions = measureRows
          .filter(row => row.value !== baseline)
          .sort(
            (left, right) =>
              left.value - right.value ||
              (left.dimensionValue ?? '').localeCompare(right.dimensionValue ?? ''),
          )
          .map(row => ({
            label: copy.statLabel(row.dimensionValue),
            value: formatReleaseStat(locale, row.value, row.unit),
          }))
        const baselineCount = baselineRows.length
        return {
          exceptions,
          id: addHeading('stats-measure-coverage', 'Measure coverage'),
          rows: [
            {
              label: exceptions.length ? 'Measures with standard coverage' : 'Measures',
              value: exceptions.length
                ? `${baselineCount} of ${measureRows.length}`
                : formatReleaseStat(locale, measureRows.length),
            },
            {
              label: 'Observations per measure',
              value: formatReleaseStat(locale, baseline),
            },
          ],
          title: 'Measure coverage',
        }
      })()
    : undefined

  const measureDefinitions =
    measures.length && !statistics
      ? {
          id: addHeading('stats-measures', 'Measures'),
          rows: measures,
          title: 'Measures',
        }
      : undefined

  const distributionRows = matching(
    row =>
      Boolean(row.dimensionValue) &&
      row.dimension !== 'district' &&
      row.dimension !== 'table' &&
      row.dimension !== 'source' &&
      !(statistics && row.dimension === 'dataset') &&
      (row.category === 'changes' ||
        (row.category === 'units' &&
          row.measure === 'count' &&
          row.dimension === 'unit_distribution') ||
        (row.category === 'records' && row.measure === 'count') ||
        (row.category === 'observations' &&
          row.measure === 'count' &&
          row.dimension === 'referencePeriod')),
  )
  const recordDistributions = distributionRows.length
    ? (() => {
        const groups = new Map<string, Row[]>()
        distributionRows.forEach(row => {
          const dimension = row.dimension
          if (dimension) groups.set(dimension, [...(groups.get(dimension) ?? []), row])
        })
        const presentations = [...groups]
          .map(([dimension, allGroupRows]) => {
            // Record counts use normalised types; source churn can use a different
            // publisher taxonomy even where some type names happen to match.
            const normalisedTypeCounts = allGroupRows.filter(
              row =>
                dimension === 'type' &&
                row.category === 'records' &&
                row.measure === 'count',
            )
            const groupRows = normalisedTypeCounts.length
              ? normalisedTypeCounts
              : allGroupRows
            const values = new Map<string, Row[]>()
            groupRows.forEach(row => {
              const dimensionValue = row.dimensionValue
              if (dimensionValue)
                values.set(dimensionValue, [...(values.get(dimensionValue) ?? []), row])
            })
            const rows = [...values]
              .map(([dimensionValue, valueRows]) => {
                const unchanged =
                  valueFor(valueRows, 'changes', 'unchanged_count') ??
                  valueFor(valueRows, 'records', 'count') ??
                  valueFor(valueRows, 'units', 'count') ??
                  valueFor(valueRows, 'observations', 'count') ??
                  0
                const added = valueFor(valueRows, 'changes', 'added_count') ?? 0
                const changed = valueFor(valueRows, 'changes', 'changed_count') ?? 0
                const removed = valueFor(valueRows, 'changes', 'removed_count') ?? 0
                const total =
                  valueFor(valueRows, 'changes', 'count') ??
                  valueFor(valueRows, 'records', 'count') ??
                  valueFor(valueRows, 'units', 'count') ??
                  valueFor(valueRows, 'observations', 'count') ??
                  0
                return {
                  label:
                    dimension === 'level' && dimensionValue === 'not_applicable'
                      ? copy.labels.notApplicable
                      : copy.statLabel(dimensionValue),
                  count: formatReleaseStat(locale, total),
                  total,
                  added,
                  changed,
                  removed,
                  unchanged,
                }
              })
              .filter(row => row.total > 0 || row.removed > 0)
              .sort((a, b) => b.total - a.total)
            if (!rows.length) return undefined
            const title =
              dimension === 'type'
                ? groupRows.some(row =>
                    ['land', 'maritime', 'mixed'].includes(row.dimensionValue ?? ''),
                  )
                  ? copy.labels.recordsByGeometryClass
                  : copy.labels.recordsByType
                : copy.statLabel(dimension)
            const observationDistribution = groupRows.some(
              row => row.category === 'observations',
            )
            return {
              eyebrow: observationDistribution
                ? copy.statLabel('observations')
                : groupRows.some(row => row.category === 'changes')
                  ? copy.labels.changeDistribution
                  : copy.labels.records,
              dimension,
              id: addHeading(sectionId(dimension), title),
              title,
              valueLabel: observationDistribution
                ? copy.statLabel('observations')
                : copy.labels.records,
              showChangeLegend: groupRows.some(row => row.category === 'changes'),
              rows,
              maxVolume: Math.max(
                1,
                ...rows.map(
                  row => row.added + row.changed + row.removed + row.unchanged,
                ),
              ),
            }
          })
          .filter((presentation): presentation is NonNullable<typeof presentation> =>
            Boolean(presentation),
          )
        if (!presentations.length) return []
        claim(distributionRows)
        return presentations
      })()
    : []

  const sourceLayerDistribution = recordDistributions.find(
    distribution => distribution.dimension === 'sourceLayer',
  )
  const remainingRecordDistributions = recordDistributions.filter(
    distribution => distribution !== sourceLayerDistribution,
  )

  const processingRows = matching(
    row => row.category === 'processing' && row.dimension === 'action',
  )
  const processing = processingRows.length
    ? (() => {
        claim(processingRows)
        addHeading('stats-processing-actions', copy.labels.processingActions)
        return processingRows.map(row => ({
          ...copy.processingAction(row.dimensionValue ?? ''),
          value: formatReleaseStat(locale, row.value, row.unit),
        }))
      })()
    : undefined
  const qualityRows = matching(
    row =>
      row.category === 'quality' ||
      (row.category === 'source_quality' && row.measure === 'repaired'),
  )
  const observationStatusRows = matching(
    row =>
      row.category === 'observations' &&
      row.measure === 'count' &&
      row.dimension === 'observationStatus' &&
      Boolean(row.dimensionValue),
  )
  const unknownUnitRows = matching(
    row =>
      row.category === 'measures' &&
      row.measure === 'count' &&
      row.dimension === 'unitCode' &&
      row.dimensionValue === 'publisher-unknown',
  )
  const quality =
    qualityRows.length || observationStatusRows.length || unknownUnitRows.length
      ? (() => {
          claim(qualityRows)
          claim(observationStatusRows)
          claim(unknownUnitRows)
          addHeading('stats-quality-checks', copy.labels.qualityChecks)
          return {
            issues: [
              ...qualityRows
                .filter(row => row.value > 0)
                .map(row => ({
                  label:
                    row.category === 'source_quality'
                      ? `${copy.statLabel(row.dimensionValue)} · Repaired`
                      : copy.statLabel(row.measure),
                  description:
                    row.category === 'source_quality'
                      ? 'Output records whose source geometry required repair during processing.'
                      : (qualityDescriptions[row.measure ?? ''] ??
                        copy.qualityDescription?.(row.measure ?? '') ??
                        copy.statLabel(row.measure)),
                  value: formatReleaseStat(locale, row.value, row.unit),
                })),
              ...observationStatusRows
                .filter(row => row.dimensionValue !== 'published' && row.value > 0)
                .map(row => ({
                  label: `${copy.statLabel(row.dimensionValue)} observations`,
                  description:
                    row.dimensionValue === 'suppressed'
                      ? 'C&SD publishes “**” instead of the value.'
                      : 'C&SD publishes “-”, “N.A.”, or “NA” instead of the value.',
                  value: formatReleaseStat(locale, row.value, row.unit),
                })),
              ...unknownUnitRows.map(row => ({
                label: 'Measures without a mapped unit',
                description:
                  'These publisher measures are valid, but their unit codes have not yet been mapped.',
                value: formatReleaseStat(locale, row.value, row.unit),
              })),
            ],
          }
        })()
      : undefined

  // Value representation is an ingestion concern, not a release-page statistic.
  claim(
    matching(
      row =>
        row.category === 'observations' &&
        row.measure === 'count' &&
        row.dimension === 'valueKind',
    ),
  )

  const generic = new Map<string, Row[]>()
  claim(
    matching(
      row =>
        row.category === 'source_features' && row.dimensionValue === 'planning_cells',
    ),
  )
  const genericGroupOrder = ['field', 'statisticKind', 'unitCode', 'aggregation']
  rows
    .filter(row => !claimed.has(row.index))
    .forEach(row => {
      const group = row.dimension ?? 'summary'
      generic.set(group, [...(generic.get(group) ?? []), row])
    })
  const genericGroups = [...generic]
    .sort(([left], [right]) => {
      const leftOrder = genericGroupOrder.indexOf(left)
      const rightOrder = genericGroupOrder.indexOf(right)
      const orderDifference =
        (leftOrder < 0 ? genericGroupOrder.length : leftOrder) -
        (rightOrder < 0 ? genericGroupOrder.length : rightOrder)
      if (orderDifference) return orderDifference
      const leftLabel = left === 'summary' ? copy.labels.stats : copy.statLabel(left)
      const rightLabel = right === 'summary' ? copy.labels.stats : copy.statLabel(right)
      return leftLabel.localeCompare(rightLabel) || left.localeCompare(right)
    })
    .map(([group, groupRows]) => {
      const label =
        group === 'summary'
          ? copy.labels.stats
          : group === 'table'
            ? 'Record Types'
            : copy.statLabel(group)
      const id = addHeading(sectionId(group), label)
      return {
        id,
        label,
        rows: [...groupRows]
          .sort((a, b) =>
            `${a.dimensionValue ?? ''}:${a.category}:${a.measure}`.localeCompare(
              `${b.dimensionValue ?? ''}:${b.category}:${b.measure}`,
            ),
          )
          .map(row => ({
            category: copy.statLabel(row.category),
            measure: copy.statLabel(row.measure),
            dimensionValue:
              statistics && group === 'dataset'
                ? 'Stats'
                : copy.statLabel(row.dimensionValue),
            unit: row.unit ?? '',
            value: formatReleaseStat(locale, row.value, row.unit),
          })),
      }
    })
  if (statistics) {
    if (statistics.profile.localeCoverage.length)
      addHeading('stats-profile-locale', 'Locale')
    const structural = remainingRecordDistributions.find(
      item => item.dimension === 'structural',
    )
    const order = [
      'stats-overview',
      'stats-profile-coverage',
      structural?.id,
      'stats-profile-availability',
      ...statistics.profile.distributions.map(item => item.id),
      'stats-profile-locale',
      ...genericGroups.map(item => item.id),
    ]
    headings.sort((a, b) => {
      const rank = (id: string) => {
        const index = order.indexOf(id)
        return index < 0 ? order.length : index
      }
      return rank(a.id) - rank(b.id)
    })
  }
  return {
    placeProfile: places?.profile,
    statisticsProfile: statistics?.profile,
    headings,
    overview,
    districtDistribution,
    localeCoverage,
    componentCoverage,
    divisionLinkage,
    geometry,
    measureCoverage,
    measures: measureDefinitions,
    recordDistributions: remainingRecordDistributions,
    sourceLayerDistribution,
    processing,
    quality,
    genericGroups,
  }
}
