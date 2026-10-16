import { discover, ReviewDatabase } from './server'
self.onmessage = async event => {
  let review: ReviewDatabase | undefined
  try {
    review = new ReviewDatabase(await discover())
    const url = new URL(event.data, 'http://localhost')
    const kind = url.searchParams.get('kind') ?? 'META'
    const group = url.searchParams.get('group') ?? ''
    const subset = url.searchParams.get('subset') ?? ''
    const table = url.searchParams.get('table') ?? ''
    const action = url.pathname
    let body: unknown
    if (action === '/catalogue') body = review.catalogue(kind)
    else if (action === '/tables') body = review.tables(kind, group)
    else if (action === '/subsets') body = review.subsets(kind, group, table)
    else if (action === '/samples' || action === '/summary') {
      const limit = Number(url.searchParams.get('limit') ?? 8)
      if (!Number.isInteger(limit) || limit < 1 || limit > 30)
        throw new Error('Sample count must be between 1 and 30')
      body = review.inspect(kind, group, table, action === '/summary', limit, subset)
    } else throw new Error('Unknown review action')
    postMessage({ status: 200, body })
  } catch (error) {
    postMessage({
      status: 400,
      body: { error: error instanceof Error ? error.message : String(error) },
    })
  } finally {
    review?.close()
  }
}
