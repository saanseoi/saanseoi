import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

import { computeVersionHash } from '../libs/db/src/versioning'

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function rehashFixture(filePath: string) {
  const resolvedPath = resolve(filePath)
  const raw = await readFile(resolvedPath, 'utf8')
  const parsed = JSON.parse(raw) as unknown

  if (!isJsonRecord(parsed)) {
    throw new Error(`Fixture must be a JSON object: ${filePath}`)
  }

  const versionHash = computeVersionHash(parsed)
  const previousVersionHash =
    typeof parsed.versionHash === 'string' ? parsed.versionHash : null

  parsed.versionHash = versionHash

  await writeFile(resolvedPath, `${JSON.stringify(parsed, null, 2)}\n`)

  const displayPath = relative(process.cwd(), resolvedPath) || resolvedPath
  const changeLabel =
    previousVersionHash === versionHash
      ? versionHash
      : `${previousVersionHash ?? '<missing>'} -> ${versionHash}`

  console.log(`${displayPath}: ${changeLabel}`)
}

const filePaths = Bun.argv.slice(2)

if (filePaths.length === 0) {
  console.error('Usage: bun run rehash:fixture <file>')
  process.exit(1)
}

for (const filePath of filePaths) {
  await rehashFixture(filePath)
}
