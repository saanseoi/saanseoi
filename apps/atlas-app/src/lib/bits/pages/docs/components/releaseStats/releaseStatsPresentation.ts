import { formatReleaseStat } from './releaseStatsFormat'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
  ReleaseStatsPresentation,
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
  stats,
  districtAreas = [],
  districtNames = [],
  locale,
  copy,
}: {
  stats?: ReleaseStat[]
  districtAreas?: ReleaseStatsDistrictArea[]
  districtNames?: ReleaseStatsDistrictName[]
  locale: string
  copy: ReleaseStatsCopy
}): ReleaseStatsPresentation {
  const rows = (stats ?? []).map((stat, index) => ({ ...stat, index }))
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

  const churn = matching(row => row.metric === 'churn' && !row.groupBy)
  const total = valueFor(churn, 'count', 'churn')
  const primaryRecords = matching(
    row => row.dimension === 'records' && row.metric === 'count' && !row.groupBy,
  )[0]
  const fallback = matching(
    row =>
      row.dimension === 'records' &&
      row.metric === 'count' &&
      (row.groupBy === 'table' || row.groupBy === 'source'),
  )[0]
  const overview = rows.length
    ? (() => {
        if (total !== undefined) claim(churn)
        if (primaryRecords) claim([primaryRecords])
        if (fallback && !primaryRecords) claim([fallback])
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
          value: valueFor(churn, dimension, 'churn') ?? 0,
          formattedValue: formatReleaseStat(
            locale,
            valueFor(churn, dimension, 'churn') ?? 0,
          ),
        }))
        addHeading('stats-overview', copy.labels.overview ?? copy.labels.dataset)
        return {
          recordCount: formatReleaseStat(
            locale,
            total ?? primaryRecords?.value ?? fallback?.value ?? 0,
          ),
          ...(total === undefined
            ? {}
            : {
                churn: {
                  baseline:
                    (metrics[0]?.value ?? 0) > 0 &&
                    metrics.slice(1).every(metric => metric.value === 0),
                  metrics,
                },
              }),
        }
      })()
    : undefined

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
          rows: result,
          showFeatureCount: new Set(result.map(row => row.featureCount)).size > 1,
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
            return {
              code,
              label: copy.localeName(code),
              count: formatReleaseStat(
                locale,
                valueFor(group, 'locale_count', 'completeness') ?? 0,
              ),
              coverage,
              coverageLabel: formatReleaseStat(locale, coverage, 'percentage'),
              providedCoverage:
                valueFor(group, 'locale_coverage_non_inferred', 'completeness') ??
                coverage,
            }
          })
          .filter(row => row.coverage > 0 || row.count !== formatReleaseStat(locale, 0))
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

  const distributionRows = matching(
    row =>
      Boolean(row.groupValue) &&
      row.groupBy !== 'district' &&
      row.groupBy !== 'table' &&
      row.groupBy !== 'source' &&
      (row.metric === 'churn' ||
        (row.dimension === 'records' && row.metric === 'count')),
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
                  0
                const added = valueFor(valueRows, 'added_count', 'churn') ?? 0
                const changed = valueFor(valueRows, 'changed_count', 'churn') ?? 0
                const removed = valueFor(valueRows, 'removed_count', 'churn') ?? 0
                const total =
                  valueFor(valueRows, 'count', 'churn') ??
                  valueFor(valueRows, 'records', 'count') ??
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
            return {
              id: addHeading(sectionId(groupBy), title),
              title,
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
  const qualityRows = matching(row => row.metric === 'quality')
  const quality = qualityRows.length
    ? (() => {
        claim(qualityRows)
        addHeading('stats-quality-checks', copy.labels.qualityChecks)
        return {
          issues: qualityRows
            .filter(row => row.value > 0)
            .map(row => ({
              label: copy.statLabel(row.dimension),
              description:
                copy.qualityDescription?.(row.dimension ?? '') ??
                copy.statLabel(row.dimension),
              value: formatReleaseStat(locale, row.value, row.metricUnit),
            })),
        }
      })()
    : undefined

  const generic = new Map<string, Row[]>()
  rows
    .filter(row => !claimed.has(row.index))
    .forEach(row => {
      const group = row.groupBy ?? 'summary'
      generic.set(group, [...(generic.get(group) ?? []), row])
    })
  const genericGroups = [...generic]
    .sort(([left], [right]) => {
      const leftLabel = left === 'summary' ? copy.labels.stats : copy.statLabel(left)
      const rightLabel = right === 'summary' ? copy.labels.stats : copy.statLabel(right)
      return leftLabel.localeCompare(rightLabel) || left.localeCompare(right)
    })
    .map(([group, groupRows]) => {
      const label = group === 'summary' ? copy.labels.stats : copy.statLabel(group)
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
            groupValue: copy.statLabel(row.groupValue),
            unit: row.metricUnit ?? '',
            value: formatReleaseStat(locale, row.value, row.metricUnit),
          })),
      }
    })
  return {
    headings,
    overview,
    districtDistribution,
    localeCoverage,
    componentCoverage,
    geometry,
    recordDistributions,
    processing,
    quality,
    genericGroups,
  }
}
