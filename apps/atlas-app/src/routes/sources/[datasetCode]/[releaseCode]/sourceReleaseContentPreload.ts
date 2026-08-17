import { browser } from '$app/env'

import { getSourceReleaseContentData } from '#lib/registry/meta.remote.js'

export type SourceReleaseContentInput = {
  datasetCode: string
  releaseCode: string
  previousReleaseCode: null
}

type SourceReleaseContentQuery = ReturnType<typeof getSourceReleaseContentData>

const preloadedQueries = new Map<string, SourceReleaseContentQuery>()

const sourceReleaseContentKey = ({
  datasetCode,
  releaseCode,
}: SourceReleaseContentInput) => `${datasetCode}/${releaseCode}`

export function getSourceReleaseContentQuery(input: SourceReleaseContentInput) {
  if (!browser) return getSourceReleaseContentData(input)

  const key = sourceReleaseContentKey(input)
  const existing = preloadedQueries.get(key)
  if (existing) return existing

  const query = getSourceReleaseContentData(input)
  preloadedQueries.set(key, query)
  return query
}

export function preloadSourceReleaseContent(input: SourceReleaseContentInput) {
  if (!browser) return

  const key = sourceReleaseContentKey(input)
  const query = getSourceReleaseContentQuery(input)
  void query.catch(() => {
    if (preloadedQueries.get(key) === query) preloadedQueries.delete(key)
  })
}
