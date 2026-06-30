import { access, readFile, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeVersionHash } from '../libs/db/src/versioning'

type JsonRecord = Record<string, unknown>

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const fixtureGroups = [
  'apiCompositions',
  'apiEndpoints',
  'apiFields',
  'apiVersions',
  'dataLicenses',
  'dataPublishers',
  'datasets',
  'dataShards',
  'rulesetVersions',
  'schemaVersions',
]

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveFixturePath(filePath: string) {
  const pathSegments = filePath.split(/[\\/]+/)

  if (isAbsolute(filePath) || pathSegments.includes('..')) {
    throw new Error(`Fixture path must stay within fixtures/meta: ${filePath}`)
  }

  const normalizedInput = filePath.replace(/^fixtures[\\/]meta[\\/]/, '')
  const metaRoot = resolve(workspaceRoot, 'fixtures/meta')
  const candidatePaths = [resolve(metaRoot, normalizedInput)]

  if (basename(normalizedInput) === normalizedInput) {
    for (const fixtureGroup of fixtureGroups) {
      candidatePaths.push(resolve(metaRoot, fixtureGroup, normalizedInput))
    }
  }

  for (const candidatePath of candidatePaths) {
    if (await pathExists(candidatePath)) {
      return candidatePath
    }
  }

  throw new Error(
    [
      `Fixture not found: ${filePath}`,
      `Looked in:`,
      ...candidatePaths.map(candidatePath => `- ${candidatePath}`),
    ].join('\n'),
  )
}

function getDisplayPath(resolvedPath: string) {
  return relative(workspaceRoot, resolvedPath) || resolvedPath
}

async function rehashFixture(filePath: string) {
  const resolvedPath = await resolveFixturePath(filePath)
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

  const displayPath = getDisplayPath(resolvedPath)
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
