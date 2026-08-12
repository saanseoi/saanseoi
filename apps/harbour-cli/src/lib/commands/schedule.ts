import { homedir } from 'node:os'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'

import type { ParsedArgs } from '../cli/options.ts'

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
  const child = Bun.spawn(
    [
      await resolveCommandPath(),
      ...(job === 'tiles' ? ['tiles:refresh'] : ['update', '--yes']),
    ],
    {
      cwd: REPO_ROOT,
      env: process.env,
      stdin: 'ignore',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  )
  const exitCode = await child.exited
  const duration = formatDuration(performance.now() - startedAt)
  const succeeded = exitCode === 0
  const summary = jobSummary(job, duration)

  await sendNotification(
    succeeded ? 'SaanSeoi schedule complete' : 'SaanSeoi schedule failed',
    succeeded ? summary : `${summary}\nExit code: ${exitCode}. See the user journal.`,
    succeeded ? 'normal' : 'critical',
  )

  if (!succeeded) process.exitCode = exitCode || 1
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

function jobSummary(job: ScheduledJob, duration: string) {
  return job === 'tiles'
    ? `PMTiles refresh finished in ${duration}. Ensured 3 published tilesets: GBA, Hong Kong, and Macao.`
    : `Dataset update finished in ${duration}. Checked all configured datasets.`
}

async function sendNotification(
  title: string,
  body: string,
  urgency: 'normal' | 'critical',
) {
  const runtimeDirectory =
    process.env.XDG_RUNTIME_DIR ??
    `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`
  const notification = Bun.spawn(
    ['notify-send', '--app-name=SaanSeoi', `--urgency=${urgency}`, title, body],
    {
      env: {
        ...process.env,
        DBUS_SESSION_BUS_ADDRESS:
          process.env.DBUS_SESSION_BUS_ADDRESS ?? `unix:path=${runtimeDirectory}/bus`,
      },
      stderr: 'ignore',
      stdout: 'ignore',
    },
  )
  await notification.exited
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}
