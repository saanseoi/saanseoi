/** Report measured small-radius results, keeping first-access and reused-cache phases separate. */
const file = process.argv[2]
if (!file) throw Error('Usage: bun scripts/buildings/summarise-small.ts RESULTS_JSON')
const report = await Bun.file(file).json()
type Sample = {
  inventory: string
  engine: string
  phase: string
  radius: number
  colo: string
  [key: string]: string | number
}
const samples: Sample[] = report.samples
/** Linear-interpolated percentile over a non-empty sample. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p,
    low = Math.floor(index)
  return (
    Math.round(
      (sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low)) * 100,
    ) / 100
  )
}
/** Summarise HTTP latency and backend work for one explicit cohort. */
function summarise(rows: Sample[]) {
  const metrics = Object.fromEntries(
    [
      'elapsedMs',
      'fetchMs',
      'd1Ms',
      'rowsRead',
      'rangeRequests',
      'rangeBytes',
      'cacheHits',
      'cacheMisses',
      'matches',
    ].map(key => {
      const values = rows.map(s => Number(s[key]))
      return [
        key,
        {
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          max: Math.max(...values),
        },
      ]
    }),
  )
  return { n: rows.length, metrics }
}
const groups = [],
  phases = []
for (const inventory of ['landsd', 'overture'])
  for (const radius of [25, 50])
    for (const engine of ['d1', 'd1-cells', 'fgb', 'fgb-cache']) {
      const rows = samples.filter(
        s => s.inventory === inventory && s.radius === radius && s.engine === engine,
      )
      if (rows.length) groups.push({ inventory, radius, engine, ...summarise(rows) })
    }
for (const inventory of ['landsd', 'overture'])
  for (const phase of [
    'first25',
    'repeat25',
    'shift25',
    'expand50',
    'repeat50',
    'shift50',
  ]) {
    const rows = samples.filter(
      s => s.inventory === inventory && s.phase === phase && s.engine === 'fgb-cache',
    )
    if (rows.length)
      phases.push({
        inventory,
        phase,
        ...summarise(rows),
        fullyCached: rows.filter(s => s.rangeRequests === 0).length,
      })
  }
const cached = samples.filter(s => s.engine === 'fgb-cache')
console.log(
  JSON.stringify(
    {
      generatedAt: report.generatedAt,
      requests: samples.length,
      cases: report.cases,
      colos: [...new Set(samples.map(s => s.colo))],
      totalD1RowsRead: samples.reduce((sum, s) => sum + Number(s.rowsRead), 0),
      cachedRangeHits: cached.reduce((sum, s) => sum + Number(s.cacheHits), 0),
      cachedRangeMisses: cached.reduce((sum, s) => sum + Number(s.cacheMisses), 0),
      groups,
      phases,
    },
    null,
    2,
  ),
)
