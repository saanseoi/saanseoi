import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  DatasetFixture,
  DatasetUpdate,
  DatasetUpdateCheck,
  DatasetUpdateCheckFrequency,
  DatasetUpdatePhase,
  UpdatePhaseState,
  UpdateSourceState,
  UpdateState,
  UpdateStateEntry,
} from './sourceUpdatesTypes.ts'
import { STATE_PATH } from './sourceUpdatesConfig.ts'

export async function readUpdateState(): Promise<UpdateState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8')) as UpdateState
  } catch {
    return {}
  }
}

export async function writeUpdateState(state: UpdateState) {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function isUpdateCheckDue(
  dataset: DatasetFixture,
  previous?: UpdateSourceState,
  force = false,
  now = Date.now(),
) {
  if (force) return true
  if (!previous?.lastChecked) return true

  const lastChecked = Date.parse(previous.lastChecked)
  if (!Number.isFinite(lastChecked)) return true

  return now - lastChecked >= updateCheckIntervalMs(dataset)
}

export function shouldCheckDataset(
  dataset: DatasetFixture,
  previous?: UpdateStateEntry,
  force = false,
) {
  if (dataset.updatePolicy?.allowUpdates === false) return false

  return getDueUpdatePhases(dataset, previous, { force }).length > 0
}

export function getDueUpdatePhases(
  dataset: DatasetFixture,
  previous?: UpdateStateEntry,
  options: {
    force?: boolean
    hasTargetRelease?: boolean
    now?: number
  } = {},
) {
  const policy = dataset.releasePolicy
  if (!policy || dataset.updatePolicy?.allowUpdates === false) return []
  const now = options.now ?? Date.now()
  const phases: DatasetUpdatePhase[] = []

  if (
    isReleasePolicyCheckDue(
      policy.checks.newReleases,
      previous?.phaseChecks?.['new-releases'],
      { ...options, now },
    )
  ) {
    phases.push('new-releases')
  }
  if (
    isReleasePolicyCheckDue(policy.checks.revisions, previous?.phaseChecks?.revisions, {
      ...options,
      now,
    })
  ) {
    phases.push('revisions')
  }
  if (
    isReleasePolicyCheckDue(policy.checks.archives, previous?.phaseChecks?.archives, {
      ...options,
      now,
    })
  ) {
    phases.push('archives')
  }
  return phases
}

function isReleasePolicyCheckDue(
  check: DatasetUpdateCheck,
  previous: UpdatePhaseState | undefined,
  options: { force?: boolean; hasTargetRelease?: boolean; now: number },
) {
  if (check.trigger === 'never') return false
  if (options.force) return true
  if (check.trigger === 'on-discovery') return false
  if (check.trigger === 'initial-only') {
    return options.hasTargetRelease === false && !previous?.lastChecked
  }
  if (check.trigger === 'periodic') {
    return isFrequencyDue(check.frequency, previous?.lastChecked, options.now)
  }

  const releaseDate = readReleasePolicyDate(previous?.releaseLastRevisedAt)
  if (!Number.isFinite(releaseDate)) return true
  if (options.now - releaseDate < check.ageDays * 86_400_000) return false
  return isFrequencyDue(check.frequency, previous?.lastChecked, options.now)
}

function readReleasePolicyDate(value: string | undefined) {
  if (!value) return Number.NaN
  const date = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (date) return Date.parse(`${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z`)
  return Date.parse(value)
}

function isFrequencyDue(
  frequency: DatasetUpdateCheckFrequency,
  lastChecked: string | undefined,
  now: number,
) {
  if (!lastChecked) return true
  const lastCheckedAt = Date.parse(lastChecked)
  if (!Number.isFinite(lastCheckedAt)) return true
  return now - lastCheckedAt >= updateCheckIntervalMs(frequency)
}

export function recordUpdatePhaseCheck(
  state: UpdateState,
  datasetCode: string,
  phase: DatasetUpdatePhase,
  input: Omit<UpdatePhaseState, 'lastChecked'> & { checkedAt: string },
) {
  const entry = state[datasetCode] ?? {}
  entry.phaseChecks = {
    ...entry.phaseChecks,
    [phase]: {
      lastChecked: input.checkedAt,
      releaseLastRevisedAt: input.releaseLastRevisedAt,
      sourceCursor: input.sourceCursor,
    },
  }
  state[datasetCode] = entry
}

export function recordUpdateState(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  if (!update.checkedAt || update.status === 'skipped') return

  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  const sourceState: UpdateSourceState = {
    version: update.version,
    versionKey: update.versionKey,
    lastChecked: update.checkedAt,
    releaseLastRevisedAt: update.releaseLastRevisedAt,
    metadataLastRevisedAt: update.metadataLastRevisedAt,
    sourceCursor: update.sourceCursor,
  }

  entry.sourceChecks = {
    ...entry.sourceChecks,
    [sourceKey]: sourceState,
  }

  if (sourceKey === datasetCode) Object.assign(entry, sourceState)
  state[datasetCode] = entry
}

/** Records durable archive custody only after the mirror operation succeeds. */
export function recordUpdateArchiveMirror(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  if (!update.mirroredArchive) return
  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  entry.archiveMirrors = {
    ...entry.archiveMirrors,
    [sourceKey]: {
      ...update.mirroredArchive,
      version: update.version,
      versionKey: update.versionKey,
    },
  }
  state[datasetCode] = entry
}

/** Records a database release only after its importer returned successfully. */
export function recordUpdateDatabaseImport(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  entry.databaseImports = {
    ...entry.databaseImports,
    [sourceKey]: {
      importedAt: new Date().toISOString(),
      version: update.version,
      versionKey: update.versionKey,
    },
  }
  state[datasetCode] = entry
}

function updateCheckIntervalMs(input: DatasetUpdateCheckFrequency | DatasetFixture) {
  const frequency =
    typeof input === 'string' ? input : (input.updatePolicy?.checkFrequency ?? 'daily')
  switch (frequency) {
    case 'weekly':
      return 7 * 86_400_000
    case 'monthly':
      return 30 * 86_400_000
    case 'quarterly':
      return 91 * 86_400_000
    case 'daily':
    case undefined:
      return 86_400_000
  }
}

export function getSourceState(
  previous: UpdateStateEntry | undefined,
  sourceKey: string,
  fallbackKey: string,
): UpdateSourceState | undefined {
  return (
    previous?.sourceChecks?.[sourceKey] ??
    (sourceKey === fallbackKey ? previous : undefined)
  )
}
