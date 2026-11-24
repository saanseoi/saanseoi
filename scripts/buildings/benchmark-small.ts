/** Compare small-radius engines with first access, repeated queries and shifted pins. */
import { createHash } from 'node:crypto'
import { COHORT_POINTS } from '../../apps/building-benchmark/src/cells'
const [baseUrl, secretPath, output] = process.argv.slice(2)
if (!baseUrl || !secretPath || !output)
  throw Error(
    'Usage: bun scripts/buildings/benchmark-small.ts WORKER_URL SECRET_JSON OUTPUT_JSON',
  )
const { BENCHMARK_TOKEN } = await Bun.file(secretPath).json()
const run = crypto.randomUUID()
const phases = [
  { phase: 'first25', radius: 25, shift: 0 },
  { phase: 'repeat25', radius: 25, shift: 0 },
  { phase: 'shift25', radius: 25, shift: 0.00007 },
  { phase: 'expand50', radius: 50, shift: 0 },
  { phase: 'repeat50', radius: 50, shift: 0 },
  { phase: 'shift50', radius: 50, shift: 0.00007 },
]
const engines = ['d1', 'd1-cells', 'fgb', 'fgb-cache']
const samples: Record<string, unknown>[] = []
const hashes = new Map<string, string>()
for (const [pi, p] of COHORT_POINTS.entries())
  for (const inventory of ['landsd', 'overture']) {
    // A fresh namespace per location/inventory prevents distant locations sharing warmed headers.
    const cacheRun = `${run}-${pi}-${inventory}`
    for (const [si, phase] of phases.entries()) {
      const startAt = (pi + si) % engines.length
      const order = [...engines.slice(startAt), ...engines.slice(0, startAt)]
      for (const engine of order) {
        const url = new URL('/nearby', baseUrl)
        const lng = p.lng + phase.shift,
          lat = p.lat + phase.shift
        for (const [key, value] of Object.entries({
          lng,
          lat,
          radius: phase.radius,
          inventory,
          engine,
          cacheRun,
        }))
          url.searchParams.set(key, String(value))
        const started = performance.now()
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${BENCHMARK_TOKEN}` },
          signal: AbortSignal.timeout(30000),
        })
        const bytes = await response.arrayBuffer()
        const elapsedMs = performance.now() - started
        if (!response.ok)
          throw Error(
            `${response.status} ${engine}: ${new TextDecoder().decode(bytes)}`,
          )
        const data = JSON.parse(new TextDecoder().decode(bytes))
        const ids = data.features.map((f: { id: string }) => f.id).sort()
        const resultHash = createHash('sha256')
          .update(JSON.stringify(ids))
          .digest('hex')
        const key = `${pi}:${inventory}:${lng}:${lat}:${phase.radius}`
        if (hashes.has(key) && hashes.get(key) !== resultHash)
          throw Error(`Result mismatch: ${key} ${engine}`)
        hashes.set(key, resultHash)
        samples.push({
          point: p.name,
          inventory,
          ...phase,
          lng,
          lat,
          elapsedMs,
          responseBytes: bytes.byteLength,
          colo: data.colo,
          ...data.metrics,
          resultHash,
        })
        await Bun.write(
          output,
          JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              run,
              baseUrl,
              method:
                'Six locations, two inventories, 25/50 m, six ordered phases; rotating engine order; fresh cache namespace per location/inventory; no result cache',
              cases: hashes.size,
              samples,
            },
            null,
            2,
          ),
        )
      }
    }
    console.log(`${p.name} ${inventory}: ${samples.length} requests; IDs agree`)
  }
console.log(
  `Completed ${samples.length} requests; ${hashes.size} searches agree across all four engines.`,
)
