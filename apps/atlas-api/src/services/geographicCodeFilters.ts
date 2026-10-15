import { resolveApiReleaseSetSnapshotsForRequest } from '@repo/core/db/metaRegistry'
import { and, eq, currentSchema } from '@repo/db'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'
import { listDivisions } from './divisions'
import {
  GeographicCodeQuerySchema,
  geographicCodeClasses,
} from '../schema/geographicCodeFilters'
import {
  withGeographicFilters,
  GeographicCrosswalkUnavailableError,
} from '../lib/geographicFilterContext'

type Geography = {
  id: string
  attributes: {
    class: string
    divisionCode?: string
    hierarchies: { full: Array<Array<{ id: string }>> }
  }
}
export function resolveGeographicMembershipGroups(
  rows: Geography[],
  filters: Record<string, unknown>,
) {
  return Object.entries(geographicCodeClasses).flatMap(([name, classes]) => {
    const code = filters[`filter[${name}]`]
    if (typeof code !== 'string') return []
    const targets = rows.filter(
      row =>
        row.attributes.divisionCode === code &&
        (classes as readonly string[]).includes(row.attributes.class),
    )
    if (targets.length !== 1)
      throw Error(
        `Unknown or ambiguous ${name}=${code} in the selected geographic release.`,
      )
    if (name === 'adminCode' && code === 'HKSAR') return []
    const id = targets[0]!.id
    return [
      new Set(
        rows
          .filter(
            row =>
              row.id === id ||
              row.attributes.hierarchies.full.some(path =>
                path.some(parent => parent.id === id),
              ),
          )
          .map(row => row.id),
      ),
    ]
  })
}

export function createGeographicCodeFilterMiddleware(
  loadDivisions = listDivisions,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const unsupportedCode = [...url.searchParams.keys()].find(key => {
      const match = /^filter\[(.+Code)\]$/.exec(key)
      return match && !Object.hasOwn(geographicCodeClasses, match[1]!)
    })
    if (unsupportedCode)
      return c.json(
        {
          error: 'unsupported_geographic_filter',
          message: `Unsupported geographic code filter: ${unsupportedCode}`,
        },
        422,
      )
    const supplied = Object.keys(geographicCodeClasses).filter(key =>
      url.searchParams.has(`filter[${key}]`),
    )
    if (!supplied.length) return next()
    if (
      /\/(?:sources|source-releases|inventories|registry|crosswalk)(?:\/|$)/.test(
        url.pathname,
      )
    )
      return c.json(
        {
          error: 'unsupported_geographic_filter',
          message: 'This metadata route has no Division membership to filter.',
        },
        422,
      )
    const parsed = GeographicCodeQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    )
    if (
      !parsed.success ||
      supplied.some(key => url.searchParams.getAll(`filter[${key}]`).length !== 1)
    )
      return c.json(
        {
          error: 'invalid_geographic_filter',
          message: 'Supply one valid uppercase code per geographic filter.',
        },
        422,
      )
    const query = parsed.data
    const isGeographic =
      url.pathname.startsWith('/divisions/') &&
      (!url.searchParams.get('domain') ||
        url.searchParams.get('domain') === 'geographic')
    const version =
      isGeographic && !url.pathname.startsWith('/divisions/v0.2') ? '0.1' : '0.2'
    const inventory = isGeographic
      ? (url.searchParams.get('inventory') ?? undefined)
      : 'saanseoi'
    const rows: Geography[] = []
    let releaseSet = query.geographicReleaseSet
    for (let offset = 0; ; offset += 1000) {
      const result = await loadDivisions({
        currentDb: c.var.currentDb,
        metaDb: c.var.metaDb,
        historyDbsByBinding: c.var.historyDbsByBinding,
        requestUrl: c.req.url,
        requestedVersionPath: `divisions/v${version}`,
        requestedApiVersion: version,
        resolvedApiVersion: `api-divisions-v${version}`,
        query: {
          inventory,
          domain: 'geographic',
          profile: 'full',
          locales: 'null',
          include: 'none',
          releaseSet:
            releaseSet ??
            (isGeographic
              ? (url.searchParams.get('releaseSet') ??
                url.searchParams.get('toReleaseSet') ??
                undefined)
              : undefined),
          ...(isGeographic
            ? {
                cohort: url.searchParams.get('cohort') ?? undefined,
                catalogRevision: url.searchParams.get('catalogRevision') ?? undefined,
              }
            : {}),
          effectiveAt: url.searchParams.get('effectiveAt') ?? undefined,
          knownAt: url.searchParams.get('knownAt') ?? undefined,
          'page[limit]': 1000,
          'page[offset]': offset,
        },
      })
      if (result.status !== 200)
        return c.json(
          {
            error: 'geographic_filter_not_ready',
            message: 'The geographic release required by these filters is unavailable.',
          },
          503,
        )
      rows.push(...(result.body.data as Geography[]))
      releaseSet = result.body.meta.apiReleaseSet as string
      if (result.body.data.length < 1000) break
    }
    let groups: Set<string>[]
    try {
      groups = resolveGeographicMembershipGroups(rows, query)
    } catch (error) {
      return c.json(
        { error: 'invalid_geographic_filter', message: (error as Error).message },
        422,
      )
    }
    const targets = Object.entries(geographicCodeClasses).flatMap(([key, classes]) => {
      const code = (query as Record<string, unknown>)[`filter[${key}]`]
      if (!code || (key === 'adminCode' && code === 'HKSAR')) return []
      return [
        rows.find(
          row =>
            row.attributes.divisionCode === code &&
            (classes as readonly string[]).includes(row.attributes.class),
        )!,
      ]
    })
    const targetClasses = targets.map(row => row.attributes.class)
    const {
      divisionGeographicCrosswalks: crosswalks,
      divisionGeographicMemberships: memberships,
    } = currentSchema
    const crosswalkSelections = groups.length
      ? await c.var.currentDb
          .select()
          .from(crosswalks)
          .where(eq(crosswalks.geographicReleaseSet, releaseSet!))
          .all()
      : []
    const sourceDomain = url.searchParams.get('domain')
    if (
      groups.length &&
      sourceDomain &&
      ['hkgov-pland-pu', 'hkgov-censtatd-hma', 'hkgov-pland-new-town'].includes(
        sourceDomain,
      )
    ) {
      const planning = await resolveApiReleaseSetSnapshotsForRequest(
        c.var.metaDb as never,
        'division',
        {
          domainCode: sourceDomain,
          apiVersion: 'api-divisions-v0.2',
          cohortKey: url.searchParams.get('cohort') ?? undefined,
          regionCode: 'hk',
          releaseSet: url.searchParams.get('releaseSet') ?? undefined,
          effectiveAt: url.searchParams.get('effectiveAt') ?? undefined,
          knownAt: url.searchParams.get('knownAt') ?? undefined,
        },
      )
      const snapshots =
        planning?.snapshots
          .filter(row => row.snapshotResourceType === 'division')
          .map(row => row.snapshotId) ?? []
      if (
        !snapshots.length ||
        snapshots.some(
          id => !crosswalkSelections.some(row => row.sourceSnapshotId === id),
        )
      )
        return c.json(
          {
            error: 'geographic_crosswalk_not_ready',
            message:
              'The selected source and geographic releases have no prepared spatial crosswalk.',
          },
          503,
        )
    }
    if (
      url.pathname.startsWith('/stats/') &&
      crosswalkSelections.some((row, index) =>
        crosswalkSelections.some(
          (other, j) =>
            index !== j &&
            row.sourceDomain === other.sourceDomain &&
            row.sourceCohort === other.sourceCohort &&
            row.sourceSnapshotId !== other.sourceSnapshotId,
        ),
      )
    )
      return c.json(
        {
          error: 'geographic_crosswalk_ambiguous',
          message:
            'Multiple source revisions require an explicit compatible geographic release.',
        },
        503,
      )
    const crosswalkGroups = await Promise.all(
      groups.map((_, index) =>
        c.var.currentDb
          .select({
            id: memberships.divisionId,
            snapshotId: crosswalks.sourceSnapshotId,
            domain: crosswalks.sourceDomain,
            cohort: crosswalks.sourceCohort,
          })
          .from(crosswalks)
          .innerJoin(memberships, eq(memberships.crosswalkId, crosswalks.id))
          .where(
            and(
              eq(crosswalks.geographicReleaseSet, releaseSet!),
              eq(memberships.geographicDivisionId, targets[index]!.id),
            ),
          )
          .all(),
      ),
    )
    c.header('X-Geographic-Release-Set', releaseSet ?? '')
    try {
      await withGeographicFilters(
        {
          releaseSet: releaseSet ?? '',
          groups,
          crosswalkGroups,
          crosswalkSelections,
          targetClasses,
          divisionClasses: new Map(rows.map(row => [row.id, row.attributes.class])),
        },
        () => next(),
      )
    } catch (error) {
      if (error instanceof GeographicCrosswalkUnavailableError)
        return c.json(
          { error: 'geographic_crosswalk_not_ready', message: error.message },
          503,
        )
      throw error
    }
    // Pin the geographic interpretation in pagination and resource links.
    if (c.res.headers.get('content-type')?.includes('json') && c.res.status < 300) {
      const document = (await c.res.json()) as Record<string, unknown>
      const pin = (value: unknown): void => {
        if (!value || typeof value !== 'object') return
        for (const [key, child] of Object.entries(value)) {
          if (key === 'links' && child && typeof child === 'object') {
            for (const [relation, href] of Object.entries(child)) {
              if (typeof href !== 'string') continue
              const link = new URL(href, url)
              if (link.origin !== url.origin) continue
              for (const name of supplied)
                link.searchParams.set(
                  `filter[${name}]`,
                  url.searchParams.get(`filter[${name}]`)!,
                )
              link.searchParams.set('geographicReleaseSet', releaseSet!)
              ;(child as Record<string, unknown>)[relation] = link.toString()
            }
          } else pin(child)
        }
      }
      pin(document)
      const headers = new Headers(c.res.headers)
      headers.delete('content-length')
      headers.delete('etag')
      c.res = new Response(JSON.stringify(document), {
        status: c.res.status,
        headers,
      })
    }
  }
}
export const geographicCodeFilterMiddleware = createGeographicCodeFilterMiddleware()
