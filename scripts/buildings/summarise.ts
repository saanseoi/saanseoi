/** Summarise measured samples without loading credentials or making network requests. */
const file = process.argv[2]
if (!file) throw Error('Usage: bun scripts/buildings/summarise.ts RESULTS_JSON')
const report = await Bun.file(file).json()
type Sample = {
  inventory: string
  engine: string
  colo: string
  [key: string]: string | number
}
const samples: Sample[] = report.samples
function percentile(values: number[], p: number): number {
  values.sort((a, b) => a - b)
  const index = (values.length - 1) * p,
    lower = Math.floor(index),
    fraction = index - lower
  return (
    Math.round(
      (values[lower] +
        (values[Math.min(lower + 1, values.length - 1)] - values[lower]) * fraction) *
        100,
    ) / 100
  )
}
const groups = []
for (const inventory of ['landsd', 'overture'])
  for (const engine of ['d1', 'fgb']) {
    const rows = samples.filter(
      row => row.inventory === inventory && row.engine === engine,
    )
    const metrics: Record<string, { p50: number; p95: number; max: number }> = {}
    for (const key of [
      'elapsedMs',
      'fetchMs',
      'd1Ms',
      'rowsRead',
      'rangeRequests',
      'rangeBytes',
      'responseBytes',
      'matches',
    ]) {
      const values = rows.map(row => Number(row[key]))
      metrics[key] = {
        p50: percentile([...values], 0.5),
        p95: percentile([...values], 0.95),
        max: Math.max(...values),
      }
    }
    groups.push({ inventory, engine, n: rows.length, metrics })
  }
console.log(
  JSON.stringify(
    {
      generatedAt: report.generatedAt,
      requests: samples.length,
      colos: [...new Set(samples.map(row => row.colo))],
      groups,
    },
    null,
    2,
  ),
)
