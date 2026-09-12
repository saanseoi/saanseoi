import { existsSync } from 'node:fs'
import { hktReleaseDate } from '@repo/basemap'
import { CLOUDFLARE_ACCOUNT_ID, REPO_ROOT, WRANGLER } from './tilesConfig.ts'

export function today() {
  return hktReleaseDate()
}

export function dockerUser() {
  if (!process.getuid || !process.getgid) {
    throw new Error(
      'Tile builds require a POSIX user identity for Docker output ownership.',
    )
  }
  return `${process.getuid()}:${process.getgid()}`
}

export async function commandSucceeds(command: string[]) {
  return (await runQuiet(command)).exitCode === 0
}

export async function capture(command: string[]) {
  const result = await runQuiet(command)
  if (result.exitCode !== 0) throw commandError(command, result.stderr, result.stdout)
  return result.stdout
}

export async function run(command: string[]) {
  const process = Bun.spawn({
    cmd: command,
    cwd: REPO_ROOT,
    env: cloudflareEnvironment(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await process.exited
  if (exitCode !== 0)
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`)
}

export async function runQuiet(command: string[]) {
  const process = Bun.spawn({
    cmd: command,
    cwd: REPO_ROOT,
    env: cloudflareEnvironment(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { stdout, stderr, exitCode }
}

function cloudflareEnvironment() {
  return {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? CLOUDFLARE_ACCOUNT_ID,
  }
}

export function wranglerCommand() {
  if (!existsSync(WRANGLER)) {
    throw new Error(
      `Local Wrangler binary not found: ${WRANGLER}. Run bun install first.`,
    )
  }
  return [WRANGLER]
}

export function commandError(command: string[], stderr: string, stdout: string) {
  return new Error(
    `Command failed: ${command.join(' ')}\n${stderr.trim() || stdout.trim()}`,
  )
}
