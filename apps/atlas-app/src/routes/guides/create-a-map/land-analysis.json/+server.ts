import { error, type RequestHandler } from '@sveltejs/kit'

const landAnalysisKey = 'guides/create-a-map/land-analysis.json'

export const GET: RequestHandler = async ({ platform, request }) => {
  const guideAssets = platform?.env.R2_GUIDE_ASSETS
  if (!guideAssets) {
    error(503, 'Land-analysis storage is unavailable in this environment.')
  }

  const object = await guideAssets.get(landAnalysisKey)
  if (!object) error(404, 'Land-analysis result is unavailable.')

  const headers = new Headers({
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-disposition': 'attachment; filename="land-analysis.json"',
    'content-type': 'application/json; charset=utf-8',
    etag: object.httpEtag,
    'x-content-type-options': 'nosniff',
  })

  if (request.headers.get('if-none-match') === object.httpEtag) {
    return new Response(null, { headers, status: 304 })
  }

  return new Response(object.body, { headers })
}
