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
const valueFor = (rows: Row[], dimension: string, metric: string) =>
  rows.find(row => row.dimension === dimension && row.metric === metric)?.value
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

  const churn = matching(row => row.metric === 'churn' && !row.groupBy)
  const total = valueFor(churn, 'count', 'churn')
  const baselineRecords =
    isFirstRelease && total === undefined
      ? stats?.find(
          row => row.dimension === 'records' && row.metric === 'count' && !row.groupBy,
        )?.value
      : undefined
  const churnValue = (dimension: string) =>
    valueFor(churn, dimension, 'churn') ??
    (dimension === 'added_count' ? (baselineRecords ?? 0) : 0)
  const primaryRecords = matching(
    row => row.dimension === 'records' && row.metric === 'count' && !row.groupBy,
  )[0]
  const fallback = matching(
    row =>
      row.dimension === 'records' &&
      row.metric === 'count' &&
      (row.groupBy === 'table' || row.groupBy === 'source'),
  )[0]
  const overview =
    (stats?.length ?? 0) > 0
      ? (() => {
          if (total !== undefined) claim(churn)
          if (primaryRecords) claim([primaryRecords])
          if (fallback && !primaryRecords && fallback.groupBy !== 'table')
            claim([fallback])
          const metrics = (
            [
              ['added_count', 'added', copy.labels.added],
              ['changed_count', 'changed', copy.labels.changed],
              ['removed_count', 'removed', copy.labels.removed],
              ['unchanged_count', 'unchanged', copy.labels.unchanged],
            ] as const
          ).map(([dimension, key, label]) => ({
            key,
            label,
            value: churnValue(dimension),
            formattedValue:
              valueFor(churn, dimension, 'churn') === undefined &&
              baselineRecords === undefined
                ? '—'
                : formatReleaseStat(locale, churnValue(dimension)),
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
                    row.dimension === 'records' &&
                    row.metric === 'count' &&
                    !row.groupBy,
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
                  metrics.slice(1).every(metric => metric.value === 0)),
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
      row.metric === 'distribution' &&
      row.dimension === 'records' &&
      row.groupBy === 'district' &&
      Boolean(row.groupValue),
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
              id: row.groupValue ?? '',
              value: row.value,
            })),
          }
        })()
      : undefined

  const geometryRows = matching(
    row =>
      row.dimension === 'geometry' &&
      row.groupBy === 'district' &&
      Boolean(row.groupValue),
  )
  const geometry = geometryRows.length
    ? (() => {
        const districts = new Map<string, Row[]>()
        geometryRows.forEach(row => {
          const districtId = row.groupValue
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
      row.metric === 'completeness' &&
      row.groupBy === 'locale' &&
      Boolean(row.groupValue),
  )
  const localeCoverage = localeRows.length
    ? (() => {
        const groups = new Map<string, Row[]>()
        localeRows.forEach(row => {
          const groupValue = row.groupValue
          if (groupValue) {
            groups.set(groupValue, [...(groups.get(groupValue) ?? []), row])
          }
        })
        const result = [...groups]
          .map(([code, group]) => {
            const coverage = valueFor(group, 'locale_coverage', 'completeness') ?? 0
            const provenanceDimensions = [
              { tone: 'provided', dimension: 'locale_coverage_provided' },
              { tone: 'inferred', dimension: 'locale_coverage_inferred' },
              { tone: 'ai-translated', dimension: 'locale_coverage_ai_translated' },
              {
                tone: 'human-translated',
                dimension: 'locale_coverage_human_translated',
              },
            ] as const
            const hasProvenanceBreakdown = group.some(row =>
              provenanceDimensions.some(({ dimension }) => row.dimension === dimension),
            )
            const segments: LocaleCoveragePresentation[number]['segments'] =
              provenanceDimensions.flatMap(({ tone, dimension }) => {
                const value = valueFor(group, dimension, 'completeness') ?? 0
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
                valueFor(group, 'locale_count', 'completeness') ?? 0,
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
      row.metric === 'completeness' &&
      row.dimension === 'component_coverage' &&
      row.groupBy === 'addressComponent' &&
      Boolean(row.groupValue),
  )
  const componentCoverage = componentRows.length
    ? (() => {
        claim(componentRows)
        addHeading('stats-address-components', copy.labels.addressComponents)
        return componentRows
          .map(row => ({
            label: copy.statLabel(row.groupValue),
            value: row.value,
            formattedValue: formatReleaseStat(
              locale,
              row.value,
              row.metricUnit ?? 'percentage',
            ),
          }))
          .sort((a, b) => b.value - a.value)
      })()
    : undefined

  const divisionLinkageRows = matching(
    row =>
      row.dimension === 'records' &&
      row.metric === 'linkage' &&
      row.groupBy === 'divisionLevel' &&
      Boolean(row.groupValue),
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
              order: divisionLevelOrder.indexOf(row.groupValue ?? ''),
              label: copy.statLabel(row.groupValue),
              value: formatReleaseStat(locale, row.value, row.metricUnit),
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
        !row.groupBy &&
        ((row.dimension === 'observations' && row.metric === 'count') ||
          (row.dimension === 'measures' && row.metric === 'count') ||
          (row.dimension === 'fields' && row.metric === 'count') ||
          (row.dimension === 'reference_periods' && row.metric === 'count') ||
          (row.dimension === 'dimensions' &&
            ['definition_count', 'value_definition_count'].includes(row.metric ?? ''))),
    ),
  )

  const measureRows = matching(
    row =>
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'measure' &&
      Boolean(row.groupValue),
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
              (left.groupValue ?? '').localeCompare(right.groupValue ?? ''),
          )
          .map(row => ({
            label: copy.statLabel(row.groupValue),
            value: formatReleaseStat(locale, row.value, row.metricUnit),
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
      Boolean(row.groupValue) &&
      row.groupBy !== 'district' &&
      row.groupBy !== 'table' &&
      row.groupBy !== 'source' &&
      !(statistics && row.groupBy === 'dataset') &&
      (row.metric === 'churn' ||
        (row.dimension === 'units' &&
          row.metric === 'count' &&
          row.groupBy === 'unit_distribution') ||
        (row.dimension === 'records' && row.metric === 'count') ||
        (row.dimension === 'observations' &&
          row.metric === 'count' &&
          row.groupBy === 'referencePeriod')),
  )
  const recordDistributions = distributionRows.length
    ? (() => {
        const groups = new Map<string, Row[]>()
        distributionRows.forEach(row => {
          const groupBy = row.groupBy
          if (groupBy) groups.set(groupBy, [...(groups.get(groupBy) ?? []), row])
        })
        const presentations = [...groups]
          .map(([groupBy, groupRows]) => {
            const values = new Map<string, Row[]>()
            groupRows.forEach(row => {
              const groupValue = row.groupValue
              if (groupValue)
                values.set(groupValue, [...(values.get(groupValue) ?? []), row])
            })
            const rows = [...values]
              .map(([groupValue, valueRows]) => {
                const unchanged =
                  valueFor(valueRows, 'unchanged_count', 'churn') ??
                  valueFor(valueRows, 'records', 'count') ??
                  valueFor(valueRows, 'units', 'count') ??
                  valueFor(valueRows, 'observations', 'count') ??
                  0
                const added = valueFor(valueRows, 'added_count', 'churn') ?? 0
                const changed = valueFor(valueRows, 'changed_count', 'churn') ?? 0
                const removed = valueFor(valueRows, 'removed_count', 'churn') ?? 0
                const total =
                  valueFor(valueRows, 'count', 'churn') ??
                  valueFor(valueRows, 'records', 'count') ??
                  valueFor(valueRows, 'units', 'count') ??
                  valueFor(valueRows, 'observations', 'count') ??
                  0
                return {
                  label: copy.statLabel(groupValue),
                  count: formatReleaseStat(locale, total),
                  total,
                  added,
                  changed,
                  removed,
                  unchanged,
                }
              })
              .filter(row => row.total > 0)
              .sort((a, b) => b.total - a.total)
            if (!rows.length) return undefined
            const title =
              groupBy === 'type'
                ? groupRows.some(row =>
                    ['land', 'maritime', 'mixed'].includes(row.groupValue ?? ''),
                  )
                  ? copy.labels.recordsByGeometryClass
                  : copy.labels.recordsByType
                : copy.statLabel(groupBy)
            const observationDistribution = groupRows.some(
              row => row.dimension === 'observations',
            )
            return {
              eyebrow: observationDistribution
                ? copy.statLabel('observations')
                : copy.labels.records,
              groupBy,
              id: addHeading(sectionId(groupBy), title),
              title,
              valueLabel: observationDistribution
                ? copy.statLabel('observations')
                : copy.labels.records,
              showChangeLegend: groupRows.some(row => row.metric === 'churn'),
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
    distribution => distribution.groupBy === 'sourceLayer',
  )
  const remainingRecordDistributions = recordDistributions.filter(
    distribution => distribution !== sourceLayerDistribution,
  )

  const processingRows = matching(
    row => row.metric === 'processing' && row.groupBy === 'action',
  )
  const processing = processingRows.length
    ? (() => {
        claim(processingRows)
        addHeading('stats-processing-actions', copy.labels.processingActions)
        return processingRows.map(row => ({
          ...copy.processingAction(row.groupValue ?? ''),
          value: formatReleaseStat(locale, row.value, row.metricUnit),
        }))
      })()
    : undefined
  const qualityRows = matching(
    row =>
      row.metric === 'quality' ||
      (row.dimension === 'source_quality' && row.metric === 'repaired'),
  )
  const observationStatusRows = matching(
    row =>
      row.dimension === 'observations' &&
      row.metric === 'count' &&
      row.groupBy === 'observationStatus' &&
      Boolean(row.groupValue),
  )
  const unknownUnitRows = matching(
    row =>
      row.dimension === 'measures' &&
      row.metric === 'count' &&
      row.groupBy === 'unitCode' &&
      row.groupValue === 'publisher-unknown',
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
                    row.dimension === 'source_quality'
                      ? `${copy.statLabel(row.groupValue)} · Repaired`
                      : copy.statLabel(row.dimension),
                  description:
                    row.dimension === 'source_quality'
                      ? 'Output records whose source geometry required repair during processing.'
                      : (copy.qualityDescription?.(row.dimension ?? '') ??
                        copy.statLabel(row.dimension)),
                  value: formatReleaseStat(locale, row.value, row.metricUnit),
                })),
              ...observationStatusRows
                .filter(row => row.groupValue !== 'published' && row.value > 0)
                .map(row => ({
                  label: `${copy.statLabel(row.groupValue)} observations`,
                  description:
                    row.groupValue === 'suppressed'
                      ? 'C&SD publishes “**” instead of the value.'
                      : 'C&SD publishes “-”, “N.A.”, or “NA” instead of the value.',
                  value: formatReleaseStat(locale, row.value, row.metricUnit),
                })),
              ...unknownUnitRows.map(row => ({
                label: 'Measures without a mapped unit',
                description:
                  'These publisher measures are valid, but their unit codes have not yet been mapped.',
                value: formatReleaseStat(locale, row.value, row.metricUnit),
              })),
            ],
          }
        })()
      : undefined

  // Value representation is an ingestion concern, not a release-page statistic.
  claim(
    matching(
      row =>
        row.dimension === 'observations' &&
        row.metric === 'count' &&
        row.groupBy === 'valueKind',
    ),
  )

  const generic = new Map<string, Row[]>()
  claim(
    matching(
      row => row.dimension === 'source_features' && row.groupValue === 'planning_cells',
    ),
  )
  const genericGroupOrder = ['field', 'statisticKind', 'unitCode', 'aggregation']
  rows
    .filter(row => !claimed.has(row.index))
    .forEach(row => {
      const group = row.groupBy ?? 'summary'
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
            `${a.groupValue ?? ''}:${a.dimension}:${a.metric}`.localeCompare(
              `${b.groupValue ?? ''}:${b.dimension}:${b.metric}`,
            ),
          )
          .map(row => ({
            dimension: copy.statLabel(row.dimension),
            metric: copy.statLabel(row.metric),
            groupValue:
              statistics && group === 'dataset'
                ? 'Stats'
                : copy.statLabel(row.groupValue),
            unit: row.metricUnit ?? '',
            value: formatReleaseStat(locale, row.value, row.metricUnit),
          })),
      }
    })
  if (statistics) {
    if (statistics.profile.localeCoverage.length)
      addHeading('stats-profile-locale', 'Locale')
    const structural = remainingRecordDistributions.find(
      item => item.groupBy === 'structural',
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
