import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { cancel, isCancel, note, outro, select } from '@clack/prompts'
import { computeVersionHash } from '@repo/db'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { getStringOption } from '../cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const FIXTURE_ROOT = resolve(REPO_ROOT, 'fixtures/meta')
const PROMOTION_ROOT = resolve(REPO_ROOT, '.local/version-promotions')

const VERSION_TYPES = [
  'apiVersion',
  'apiComposition',
  'schemaVersion',
  'rulesetVersion',
] as const

type VersionType = (typeof VERSION_TYPES)[number]
type JsonFixture = Record<string, unknown> & { versionHash?: string }

const VERSION_TYPE_DIRS: Record<VersionType, string> = {
  apiVersion: 'apiVersions',
  apiComposition: 'apiCompositions',
  schemaVersion: 'schemaVersions',
  rulesetVersion: 'rulesetVersions',
}

type FixtureRecord = {
  data: JsonFixture
  path: string
  type: VersionType
}

export async function runVersionBumpCommand(args: ParsedArgs) {
  const type = await resolveVersionType(args)
  const fixtures = await readVersionFixtures(type)
  const source = await selectFixture(args, fixtures, 'Version fixture to copy')
  const next = bumpFixture(type, source)

  if (existsSync(next.path)) {
    throw new Error(`Version fixture already exists: ${next.path}`)
  }

  next.data.versionHash = computeVersionHash(next.data)
  await writeFile(next.path, `${JSON.stringify(next.data, null, 2)}\n`, 'utf8')

  note([`type: ${type}`, `from: ${source.path}`, `created: ${next.path}`].join('\n'))

  if (!args.options['no-open']) {
    const editor =
      getStringOption(args, ['editor']) ?? process.env.SAANSEOI_EDITOR ?? 'zed'
    const processHandle = Bun.spawn([editor, next.path], {
      cwd: REPO_ROOT,
      stderr: 'ignore',
      stdout: 'ignore',
    })
    processHandle.unref()
  }

  outro('Version fixture created as a draft')
}

export async function runVersionPublishCommand(args: ParsedArgs, target: UploadTarget) {
  const fixtures = await readAllVersionFixtures()
  const drafts = fixtures.filter(fixture => fixture.data.status === 'draft')
  const selected = await selectFixture(
    args,
    drafts.length > 0 ? drafts : fixtures,
    'Fixture to load into the registry',
  )
  const targetName = target.environment === 'dev' ? 'local' : target.environment

  note(
    [
      `fixture: ${selected.path}`,
      `target: ${targetName}`,
      'publication: registry sync (all fixture hashes are idempotently reconciled)',
    ].join('\n'),
    'VERSION PUBLISH',
  )

  if (args.options['dry-run']) {
    outro('Dry run complete')
    return
  }

  const child = Bun.spawn(
    ['bun', resolve(REPO_ROOT, 'libs/db/scripts/syncMetaRegistry.ts'), targetName],
    { cwd: REPO_ROOT, stderr: 'inherit', stdout: 'inherit' },
  )
  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`Meta registry sync failed with exit code ${exitCode}.`)
  }

  outro(`Loaded ${fixtureCode(selected)} into ${targetName}`)
}

export async function runVersionPromoteCommand(args: ParsedArgs, target: UploadTarget) {
  const fixtures = await readAllVersionFixtures()
  const selected = await selectFixture(args, fixtures, 'Version to promote')
  const targetName = target.environment === 'dev' ? 'local' : target.environment
  const code = fixtureCode(selected)
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  const promptPath = resolve(PROMOTION_ROOT, `${timestamp}-${code}.md`)
  const prompt = buildPromotionPrompt(selected, targetName)

  await mkdir(PROMOTION_ROOT, { recursive: true })
  await writeFile(promptPath, prompt, 'utf8')

  note(
    [
      `fixture: ${selected.path}`,
      `target: ${targetName}`,
      `promotion prompt: ${promptPath}`,
    ].join('\n'),
    'VERSION PROMOTION PLAN',
  )
  outro('Promotion scaffold created; no domain release was mutated')
}

export async function runVersionStatusCommand() {
  const fixtures = await readAllVersionFixtures()
  const lines = fixtures
    .sort((left, right) => fixtureCode(left).localeCompare(fixtureCode(right)))
    .map(
      fixture =>
        `${fixture.type.padEnd(16)} ${String(fixture.data.status ?? 'fixture').padEnd(8)} ${fixtureCode(fixture)}`,
    )

  note(lines.join('\n') || 'No version fixtures found.', 'VERSION STATUS')
  outro(`${fixtures.length} version fixtures`)
}

export async function runVersionDoctorCommand() {
  const fixtures = await readAllVersionFixtures()
  const versionedJsonFixtures = await readVersionedJsonFixtures(FIXTURE_ROOT)
  const apiVersionCodes = new Set(
    fixtures
      .filter(fixture => fixture.type === 'apiVersion')
      .map(fixture => fixtureCode(fixture)),
  )
  const errors: string[] = []

  for (const fixture of fixtures) {
    if (
      fixture.type === 'apiComposition' &&
      !apiVersionCodes.has(String(fixture.data.apiVersion ?? ''))
    ) {
      errors.push(
        `${fixture.path}: unknown apiVersion ${String(fixture.data.apiVersion)}`,
      )
    }
  }

  for (const fixture of versionedJsonFixtures) {
    const expectedHash = computeVersionHash(fixture.data)
    if (fixture.data.versionHash !== expectedHash) {
      errors.push(`${fixture.path}: versionHash does not match content`)
    }
    if (
      fixture.path.includes('/identifierBridges/') &&
      typeof fixture.data.sourceReleaseCode === 'string' &&
      !fixture.data.sourceReleaseCode.startsWith('dr-')
    ) {
      errors.push(`${fixture.path}: sourceReleaseCode must use the dr- grammar`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Version fixture validation failed:\n${errors.join('\n')}`)
  }

  outro(`Validated ${versionedJsonFixtures.length} versioned JSON fixtures`)
}

async function resolveVersionType(args: ParsedArgs): Promise<VersionType> {
  const requested = getStringOption(args, ['version-type', 'type'])
  if (requested && VERSION_TYPES.includes(requested as VersionType)) {
    return requested as VersionType
  }

  const answer = await select({
    message: 'Which version type should be incremented?',
    options: VERSION_TYPES.map(value => ({ label: value, value })),
  })
  if (isCancel(answer)) {
    cancel('Version bump cancelled')
    throw new Error('Version bump cancelled.')
  }
  return answer
}

async function readVersionFixtures(type: VersionType) {
  const directory = resolve(FIXTURE_ROOT, VERSION_TYPE_DIRS[type])
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort()
  return Promise.all(
    names.map(async name => ({
      data: JSON.parse(await readFile(resolve(directory, name), 'utf8')) as JsonFixture,
      path: resolve(directory, name),
      type,
    })),
  )
}

async function readAllVersionFixtures() {
  return (await Promise.all(VERSION_TYPES.map(readVersionFixtures))).flat()
}

async function readVersionedJsonFixtures(directory: string): Promise<FixtureRecord[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const fixtures = await Promise.all(
    entries.map(async entry => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return readVersionedJsonFixtures(path)
      if (!entry.name.endsWith('.json')) return []
      const data = JSON.parse(await readFile(path, 'utf8')) as JsonFixture
      return typeof data.versionHash === 'string'
        ? [{ data, path, type: 'apiVersion' as const }]
        : []
    }),
  )
  return fixtures.flat()
}

async function selectFixture(
  args: ParsedArgs,
  fixtures: FixtureRecord[],
  message: string,
) {
  if (fixtures.length === 0) throw new Error('No eligible version fixtures found.')
  const requested = getStringOption(args, ['code', 'version'])
  if (requested) {
    const fixture = fixtures.find(candidate => fixtureCode(candidate) === requested)
    if (!fixture) throw new Error(`Version fixture not found: ${requested}`)
    return fixture
  }
  const answer = await select({
    message,
    options: fixtures.map(fixture => ({
      label: `${fixture.type}: ${fixtureCode(fixture)}`,
      value: fixture.path,
    })),
  })
  if (isCancel(answer)) {
    cancel('Version command cancelled')
    throw new Error('Version command cancelled.')
  }
  const fixture = fixtures.find(candidate => candidate.path === answer)
  if (!fixture) throw new Error(`Version fixture not found: ${answer}`)
  return fixture
}

function bumpFixture(type: VersionType, source: FixtureRecord): FixtureRecord {
  const data = structuredClone(source.data)
  data.versionHash = 'sha256:pending'
  data.status = 'draft'

  if (type === 'apiComposition') {
    const version = Number(data.version) + 1
    const family = String(data.code).match(/^comp-(.+?)(?:-v\d+)?$/)?.[1]
    if (!family || !Number.isInteger(version)) throw new Error('Invalid composition.')
    data.version = version
    data.code = `comp-${family}-v${version}`
    return {
      data,
      path: resolve(
        FIXTURE_ROOT,
        VERSION_TYPE_DIRS[type],
        `api-${family}-comp-v${version}.json`,
      ),
      type,
    }
  }

  if (type === 'apiVersion') {
    const family = String(data.familyType)
    const parts = String(data.version).split('.').map(Number)
    parts[parts.length - 1] = (parts.at(-1) ?? 0) + 1
    const version = parts.join('.')
    data.version = version
    data.code = `api-${family}-v${version}`
    data.publishedAt = null
    return {
      data,
      path: resolve(
        FIXTURE_ROOT,
        VERSION_TYPE_DIRS[type],
        `api-${family}-v${version}.json`,
      ),
      type,
    }
  }

  const version = Number(data.version) + 1
  const resourceType = String(data.resourceType)
  data.version = String(version)
  data.code =
    type === 'schemaVersion'
      ? `sv-${resourceType}-v${version}`
      : `rs-${resourceType}-${String(data.strategy)}-v${version}`
  return {
    data,
    path: resolve(FIXTURE_ROOT, VERSION_TYPE_DIRS[type], `${data.code}.json`),
    type,
  }
}

function fixtureCode(fixture: FixtureRecord) {
  return String(fixture.data.code ?? basename(fixture.path, '.json'))
}

function buildPromotionPrompt(fixture: FixtureRecord, target: string) {
  const code = fixtureCode(fixture)
  const compositionInstructions =
    fixture.type === 'apiComposition'
      ? `\nFor every published domain/cohort release associated with ${String(fixture.data.apiVersion)}:\n\n1. Resolve every required member under ${code}.\n2. Create the next immutable API release-set revision; never mutate the old release.\n3. Preserve the old release in existing catalogue revisions.\n4. Publish a new catalogue revision that selects the promoted domain releases.\n5. Report cohorts that cannot satisfy the new composition instead of silently omitting members.\n`
      : '\nDetermine every downstream fixture and immutable release that must explicitly reference this version.\n'

  return `# Saanseoi version promotion\n\nTarget: ${target}\nFixture type: ${fixture.type}\nFixture: ${fixture.path}\nCode: ${code}\n${compositionInstructions}\n## Required checks\n\n- Diff the fixture against its predecessor.\n- Validate hashes and foreign-code references.\n- Produce a dry-run list of affected API families, domains, cohorts, and catalogue revisions.\n- Do not mutate an existing published snapshot, domain release, or catalogue revision.\n- Run replay checks for an old catalogue permalink and an effective-time query.\n- If automation is unavailable, implement the smallest fixture-driven promotion command and retain this file as the audit plan.\n`
}
