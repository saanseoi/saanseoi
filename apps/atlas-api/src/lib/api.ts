import type {
  ApiProfileName,
  RequestedApiLocale,
  RequestedApiLocaleSelection,
} from '@repo/core'
import type { ApiFamilyType } from '@repo/db'

export type ApiDocumentLocales = RequestedApiLocale[] | ['*']

export type ApiVersionMetadata = {
  requestedApiVersion: string
  requestedApiFamily: ApiFamilyType
  resolvedApiVersion: string
  apiReleaseSet: string
  schemaVersion?: string
  rulesetVersion?: string
}

export type SnapshotNotReadyResponse<TResourceType extends string = string> = {
  httpStatus: 503
  error: 'snapshot_not_ready'
  message: `No active ${TResourceType} snapshot is published.`
}

export function sanitiseResponseUrl(url: string | URL) {
  const safeUrl = new URL(url)
  safeUrl.searchParams.delete('access_token')
  return safeUrl
}

export function buildPaginationLink(args: { url: URL; limit: number; offset: number }) {
  const pageUrl = sanitiseResponseUrl(args.url)
  pageUrl.searchParams.set('page[limit]', String(args.limit))
  pageUrl.searchParams.set('page[offset]', String(args.offset))
  return pageUrl.toString()
}

export function buildPaginationLinks(args: {
  url: URL
  limit: number
  offset: number
  total: number
}) {
  const links: Record<string, string> = {
    self: buildPaginationLink({
      url: args.url,
      limit: args.limit,
      offset: args.offset,
    }),
    first: buildPaginationLink({
      url: args.url,
      limit: args.limit,
      offset: 0,
    }),
  }

  if (args.offset > 0) {
    links.prev = buildPaginationLink({
      url: args.url,
      limit: args.limit,
      offset: Math.max(0, args.offset - args.limit),
    })
  }

  if (args.offset + args.limit < args.total) {
    links.next = buildPaginationLink({
      url: args.url,
      limit: args.limit,
      offset: args.offset + args.limit,
    })
  }

  return links
}

export function resolveApiMetaLocales(
  localeSelection: RequestedApiLocaleSelection,
): ApiDocumentLocales {
  if (localeSelection.mode === 'all') {
    return ['*']
  }

  return localeSelection.locales
}

export function buildApiVersionMetadata(args: {
  requestedApiVersion: string
  requestedApiFamily: ApiFamilyType
  resolvedApiVersion: string
  apiReleaseSet: string
  schemaVersion: string
  rulesetVersion: string
  profile: ApiProfileName
}): ApiVersionMetadata {
  const metadata: ApiVersionMetadata = {
    requestedApiVersion: args.requestedApiVersion,
    requestedApiFamily: args.requestedApiFamily,
    resolvedApiVersion: args.resolvedApiVersion,
    apiReleaseSet: args.apiReleaseSet,
  }

  if (args.profile === 'full') {
    metadata.schemaVersion = args.schemaVersion
    metadata.rulesetVersion = args.rulesetVersion
  }

  return metadata
}

export function buildJsonApiListDocument<
  TResource,
  TMeta extends object,
  TIncludedResource = TResource,
>(args: {
  url: URL
  data: TResource[]
  included?: TIncludedResource[]
  limit: number
  offset: number
  total: number
  meta: TMeta
  permalink?: string
}) {
  const links = buildPaginationLinks({
    url: args.url,
    limit: args.limit,
    offset: args.offset,
    total: args.total,
  })
  if (args.permalink) {
    links.permalink = sanitiseResponseUrl(args.permalink).toString()
  }

  return {
    jsonapi: {
      version: '1.1' as const,
    },
    links,
    data: args.data,
    ...(args.included && args.included.length > 0 ? { included: args.included } : {}),
    meta: args.meta,
  }
}

export function buildJsonApiDetailDocument<
  TResource,
  TMeta extends object,
  TIncludedResource = TResource,
>(args: {
  url: URL
  data: TResource
  included?: TIncludedResource[]
  meta: TMeta
  permalink?: string
}) {
  return {
    jsonapi: {
      version: '1.1' as const,
    },
    links: {
      self: sanitiseResponseUrl(args.url).toString(),
      ...(args.permalink
        ? { permalink: sanitiseResponseUrl(args.permalink).toString() }
        : {}),
    },
    data: args.data,
    ...(args.included && args.included.length > 0 ? { included: args.included } : {}),
    meta: args.meta,
  }
}

export function buildSnapshotNotReadyResponse<TResourceType extends string>(
  resourceType: TResourceType,
): SnapshotNotReadyResponse<TResourceType> {
  return {
    httpStatus: 503,
    error: 'snapshot_not_ready',
    message: `No active ${resourceType} snapshot is published.`,
  }
}
