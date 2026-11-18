import { homedir, tmpdir } from 'node:os'
import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'

import type { ParsedArgs } from '../cli/options.ts'
import type { ScheduledUpdateSummary, ScheduledResultRow } from './updateTypes.ts'
import { today } from './tilesExecution.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const UNIT_NAMES = ['saanseoi-monthly-tiles.timer', 'saanseoi-daily-update.timer']

type ScheduledJob = 'tiles' | 'update'

export async function runScheduleCommand(args: ParsedArgs, printUsage: () => void) {
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(option => option !== 'dry-run')
  ) {
    printUsage()
    throw new Error('schedule accepts only --dry-run.')
  }

  const commandPath = await resolveCommandPath()
  const bunPath = await realpath(process.execPath)
  const unitDirectory = resolveSystemdUserUnitDirectory()
  const units = buildUnits(commandPath, bunPath)

  if (args.options['dry-run']) {
    note(
      [
        `units: ${unitDirectory}`,
        'monthly tiles: first day of each month at 00:05 (persistent)',
        'daily update: every day at 00:30 (persistent, non-interactive)',
      ].join('\n'),
      'SAANSEOI SCHEDULE DRY RUN',
    )
    outro('Dry run complete')
    return
  }

  await mkdir(unitDirectory, { recursive: true })
  await Promise.all(
    Object.entries(units).map(([name, content]) =>
      writeFile(join(unitDirectory, name), content, 'utf8'),
    ),
  )
  await runSystemctl(['daemon-reload'])
  await runSystemctl(['enable', '--now', ...UNIT_NAMES])

  outro(
    `Installed SaanSeoi timers: tiles on the first at 00:05; updates daily at 00:30.`,
  )
}

/** Invoked only by the installed systemd services. */
export async function runScheduledCommand(args: ParsedArgs, printUsage: () => void) {
  const job = args.positionals[0]
  if (
    (job !== 'tiles' && job !== 'update') ||
    args.positionals.length !== 1 ||
    Object.keys(args.options).length > 0
  ) {
    printUsage()
    throw new Error('schedule:run requires either tiles or update.')
  }

  const startedAt = performance.now()
  const summaryPath = await createRunSummaryPath(job)
  await sendNotification(job, 'Running', 'Scheduled job is running.', '0s')
  let exitCode = 1
  let launchError = ''
  try {
    const child = Bun.spawn(
      [await resolveCommandPath(), ...scheduledJobArguments(job)],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          SAANSEOI_RUN_SUMMARY_PATH: summaryPath,
        },
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
      },
    )
    exitCode = await child.exited
  } catch (error) {
    launchError = error instanceof Error ? error.message : String(error)
  }
  const duration = formatDuration(performance.now() - startedAt)
  const result = await jobSummary(job, duration, summaryPath, exitCode)
  const body = launchError ? `${result.body}\n${launchError}` : result.body
  await sendNotification(job, result.state, launchError || '', duration, result.results)
  await postDiscordJobMessage(result.state === 'Complete', body)

  if (exitCode !== 0 || result.state === 'Failed') process.exitCode = exitCode || 1
}

export function scheduledJobArguments(job: ScheduledJob, date = today()) {
  return job === 'tiles'
    ? ['tiles:refresh', '--date', `${date.slice(0, 7)}-01`]
    : ['update', '--yes']
}

export function buildUnits(commandPath: string, bunPath = process.execPath) {
  const executable = quoteSystemdArgument(commandPath)
  const bunExecutable = quoteSystemdArgument(bunPath)
  return {
    'saanseoi-monthly-tiles.service': `[Unit]
Description=SaanSeoi monthly PMTiles refresh
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
Environment=SAANSEOI_BUN_PATH=${bunExecutable}
EnvironmentFile=-%h/.config/saanseoi/scheduled-jobs.env
ExecStart=${executable} schedule:run tiles
TimeoutStartSec=infinity
StandardOutput=journal
StandardError=journal
`,
    'saanseoi-monthly-tiles.timer': `[Unit]
Description=Run the SaanSeoi monthly PMTiles refresh

[Timer]
OnCalendar=*-*-01 00:05:00
Persistent=true
Unit=saanseoi-monthly-tiles.service

[Install]
WantedBy=timers.target
`,
    'saanseoi-daily-update.service': `[Unit]
Description=SaanSeoi daily dataset update
Wants=network-online.target
After=network-online.target saanseoi-monthly-tiles.service

[Service]
Type=oneshot
Environment=SAANSEOI_BUN_PATH=${bunExecutable}
EnvironmentFile=-%h/.config/saanseoi/scheduled-jobs.env
ExecStart=${executable} schedule:run update
TimeoutStartSec=infinity
StandardOutput=journal
StandardError=journal
`,
    'saanseoi-daily-update.timer': `[Unit]
Description=Run the SaanSeoi daily dataset update

[Timer]
OnCalendar=*-*-* 00:30:00
Persistent=true
Unit=saanseoi-daily-update.service

[Install]
WantedBy=timers.target
`,
  }
}

export function resolveSystemdUserUnitDirectory() {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd/user')
}

function quoteSystemdArgument(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

async function resolveCommandPath() {
  const commandPath =
    process.env.SAANSEOI_COMMAND_PATH ?? join(REPO_ROOT, 'bin/saanseoi')
  return realpath(commandPath)
}

async function runSystemctl(args: string[]) {
  const process = Bun.spawn(['systemctl', '--user', ...args], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await process.exited
  if (exitCode !== 0) throw new Error(`systemctl --user ${args.join(' ')} failed.`)
}

async function jobSummary(
  job: ScheduledJob,
  duration: string,
  summaryPath: string,
  exitCode: number,
) {
  let summary: ScheduledUpdateSummary | undefined
  try {
    const value = JSON.parse(await readFile(summaryPath, 'utf8'))
    if (
      Array.isArray(value?.added) &&
      Array.isArray(value?.errors) &&
      value.errors.every((error: unknown) => typeof error === 'string') &&
      value.added.every(
        (item: ScheduledUpdateSummary['added'][number]) =>
          item &&
          typeof item.datasetCode === 'string' &&
          (item.version === undefined || typeof item.version === 'string') &&
          (item.datasetName === undefined || typeof item.datasetName === 'string'),
      ) &&
      (value.results === undefined ||
        (Array.isArray(value.results) &&
          value.results.every(
            (row: ScheduledResultRow) =>
              row &&
              typeof row.label === 'string' &&
              typeof row.value === 'string' &&
              (row.tone === undefined || typeof row.tone === 'string') &&
              Array.isArray(row.ingredients) &&
              row.ingredients.every(
                item =>
                  item &&
                  typeof item.label === 'string' &&
                  typeof item.value === 'string',
              ),
          )))
    )
      summary = value
  } catch {
    // A missing or malformed result is unverified, never a successful update.
  } finally {
    await unlink(summaryPath).catch(() => undefined)
  }
  return scheduledJobResult(job, duration, exitCode, summary)
}

export function scheduledJobResult(
  job: ScheduledJob,
  duration: string,
  exitCode: number,
  summary?: ScheduledUpdateSummary,
) {
  const failed = exitCode !== 0 || Boolean(summary?.errors.length)
  const state = failed
    ? 'Failed'
    : !summary || (job === 'tiles' && !summary.results?.length)
      ? 'Unverified'
      : 'Complete'
  const details = summary
    ? [
        summary.added.length
          ? `${summary.added.length} source release(s) published`
          : 'No source releases published',
        ...summary.added.map(
          item => `${item.datasetCode}${item.version ? ` · ${item.version}` : ''}`,
        ),
        ...summary.errors,
      ]
    : [
        job === 'tiles'
          ? 'Tiles refresh command finished'
          : 'Update summary missing or invalid; inspect the run log before treating this as complete.',
      ]
  if (exitCode !== 0)
    details.push(`Exit code: ${exitCode}. Open the run log or journal for follow-up.`)
  const results: ScheduledResultRow[] = summary?.results?.length
    ? [...summary.results]
    : job === 'update' && summary
      ? [
          {
            label: 'Source releases',
            value: summary.added.length
              ? `${summary.added.length} published`
              : 'None published',
            ingredients: summary.added.map(item => ({
              label: item.datasetName || item.datasetCode,
              value: item.version || 'Published',
            })),
          },
        ]
      : [
          {
            label: job === 'tiles' ? 'Tiles refresh' : 'Dataset update',
            value: 'Unverified',
            ingredients: [{ label: 'Result summary', value: 'Missing or invalid' }],
          },
        ]
  if (summary?.errors.length)
    results.push({
      label: 'Issues',
      value: String(summary.errors.length),
      tone: 'critical',
      ingredients: summary.errors.map(error => ({ label: error, value: 'Failed' })),
    })
  if (exitCode !== 0)
    results.push({
      label: 'Command',
      value: `Exit ${exitCode}`,
      tone: 'critical',
      ingredients: [],
    })
  return { state, results, body: `${details.join('\n')}\nDuration: ${duration}` }
}

async function createRunSummaryPath(job: ScheduledJob) {
  const runtimeDirectory = process.env.XDG_RUNTIME_DIR ?? join(tmpdir(), 'saanseoi')
  await mkdir(runtimeDirectory, { recursive: true })
  return join(runtimeDirectory, `saanseoi-${job}-${randomUUID()}.json`)
}

async function postDiscordJobMessage(succeeded: boolean, summary: string) {
  const webhookUrl = process.env.SAANSEOI_DISCORD_JOBS_WEBHOOK_URL
  if (!webhookUrl) return

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: succeeded ? summary : `❌ ${summary.replace(/^(?:✅|⚠️)\s*/, '')}`,
        allowed_mentions: { parse: [] },
      }),
    })
    if (!response.ok) {
      throw new Error(`Discord webhook returned HTTP ${response.status}.`)
    }
  } catch (error) {
    console.error(
      `Could not post the SaanSeoi scheduled-job record to Discord: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function scheduledNotificationArguments(
  job: ScheduledJob,
  state: string,
  body: string,
  duration: string,
  logPath?: string,
  results: ScheduledResultRow[] = [],
) {
  const unit =
    job === 'tiles' ? 'saanseoi-monthly-tiles.service' : 'saanseoi-daily-update.service'
  const actions = [
    ...(logPath
      ? [{ label: 'Open run log', command: ['kitty', '--hold', 'less', '--', logPath] }]
      : []),
    {
      label: 'Open journal',
      command: ['kitty', '--hold', 'journalctl', '--user', '-u', unit, '-n', '200'],
    },
  ]
  return [
    'send',
    `SaanSeoi ${job === 'tiles' ? 'tiles refresh' : 'daily update'}`,
    body,
    '--app',
    'SaanSeoi',
    '--id',
    `schedule-${job}`,
    '--type',
    'results-table',
    '--data',
    JSON.stringify({
      state,
      duration,
      results,
      tone:
        state === 'Failed' ? 'critical' : state === 'Complete' ? 'success' : 'accent',
    }),
    '--urgency',
    state === 'Failed' ? 'critical' : 'normal',
    '--timeout',
    'until-dismissed',
    '--actions',
    JSON.stringify(actions),
  ]
}

async function sendNotification(
  job: ScheduledJob,
  state: string,
  body: string,
  duration: string,
  results: ScheduledResultRow[] = [],
) {
  const runtimeDirectory =
    process.env.XDG_RUNTIME_DIR ??
    `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`
  try {
    const notification = Bun.spawn(
      [
        Bun.which('notjikctl') ?? join(homedir(), '.local/bin/notjikctl'),
        ...scheduledNotificationArguments(
          job,
          state,
          body,
          duration,
          process.env.SAANSEOI_LOG_PATH,
          results,
        ),
      ],
      {
        env: {
          ...process.env,
          DBUS_SESSION_BUS_ADDRESS:
            process.env.DBUS_SESSION_BUS_ADDRESS ?? `unix:path=${runtimeDirectory}/bus`,
        },
        stderr: 'inherit',
        stdout: 'ignore',
      },
    )
    if ((await notification.exited) !== 0)
      throw new Error('notjikctl returned a non-zero exit code')
  } catch (error) {
    console.error(
      `Could not report SaanSeoi ${job} status through notjik: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}
