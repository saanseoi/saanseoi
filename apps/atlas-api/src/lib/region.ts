import { sanitiseResponseUrl } from './api'

export function emptyRegionCollection(requestUrl: string) {
  return {
    jsonapi: { version: '1.1' as const },
    data: [],
    links: { self: sanitiseResponseUrl(requestUrl).toString() },
    meta: { region: 'mo' as const, page: { total: 0 as const } },
  }
}

export function regionNotFound() {
  return {
    httpStatus: 404 as const,
    error: 'not_found',
    message: 'No matching record is published for the selected region.',
  }
}

export function isUnpublishedMacao(
  region: string,
  result: { status: number; body: unknown },
) {
  return (
    region === 'mo' &&
    result.status === 503 &&
    typeof result.body === 'object' &&
    result.body !== null &&
    'error' in result.body &&
    result.body.error === 'snapshot_not_ready'
  )
}
