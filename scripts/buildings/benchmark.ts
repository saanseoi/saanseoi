/** Run the authenticated preview comparison; credentials remain in a local ignored file. */
import { createHash } from 'node:crypto'
const [baseUrl, secretPath, output] = process.argv.slice(2)
if (!baseUrl || !secretPath || !output)
  throw Error(
    'Usage: bun scripts/buildings/benchmark.ts WORKER_URL SECRET_JSON OUTPUT_JSON',
  )
const { BENCHMARK_TOKEN } = await Bun.file(secretPath).json()
const points = [
  { name: 'Mong Kok', lng: 114.1704, lat: 22.3193 },
  { name: 'Tsim Sha Tsui', lng: 114.1722, lat: 22.2986 },
  { name: 'Central', lng: 114.1577, lat: 22.2819 },
  { name: 'Quarry Bay', lng: 114.211, lat: 22.284 },
  { name: 'Sha Tin', lng: 114.1898, lat: 22.3832 },
  { name: 'Kam Tin', lng: 114.066, lat: 22.446 },
]
const samples: Record<string, unknown>[] = []
const hashes = new Map<string, string>()
for (let repeat = 0; repeat < 3; repeat++)
  for (const point of points)
    for (const radius of [100, 250, 500, 1000])
      for (const inventory of ['landsd', 'overture']) {
        for (const engine of repeat % 2 === 0 ? ['d1', 'fgb'] : ['fgb', 'd1']) {
          const url = new URL('/nearby', baseUrl)
          for (const [k, v] of Object.entries({ ...point, radius, inventory, engine }))
            url.searchParams.set(k, String(v))
          const start = performance.now()
          const response = await fetch(url, {
            headers: { Authorization: `Bearer ${BENCHMARK_TOKEN}` },
            signal: AbortSignal.timeout(60000),
          })
          const body = await response.arrayBuffer()
          const elapsedMs = performance.now() - start
          if (!response.ok)
            throw Error(
              `${response.status} ${point.name} ${inventory} ${engine} ${radius}: ${new TextDecoder().decode(body)}`,
            )
          const data = JSON.parse(new TextDecoder().decode(body))
          const ids = data.features.map((f: { id: string }) => f.id).sort()
          const hash = createHash('sha256').update(JSON.stringify(ids)).digest('hex')
          const key = `${point.name}:${radius}:${inventory}`
          if (hashes.has(key) && hashes.get(key) !== hash)
            throw Error(`Result mismatch: ${key}`)
          hashes.set(key, hash)
          samples.push({
            repeat,
            point: point.name,
            radius,
            inventory,
            engine,
            elapsedMs,
            responseBytes: body.byteLength,
            colo: data.colo,
            ...data.metrics,
            resultHash: hash,
          })
          await Bun.write(
            output,
            JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                baseUrl,
                method:
                  'Sequential, alternating engine order, fresh FGB reader per request; infrastructure caches not controlled',
                samples,
              },
              null,
              2,
            ),
          )
        }
        if (radius === 1000)
          console.log(`repeat ${repeat + 1}: ${point.name}, ${inventory}: IDs agree`)
      }
console.log(
  `Completed ${samples.length} requests; ${hashes.size} search cases agree across engines and repeats.`,
)
