import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

/** Resolve local listener settings independently of the caller's directory.
 * @param env Local development overrides.
 * @returns Loopback ports and an absolute persistence path.
 */
export function exportDevSettings(env: Readonly<Record<string, string | undefined>>): {
  port: number
  inspectorPort: number
  persistPath: string
} {
  const port = Number(env.EXPORT_PORT ?? 8793)
  const inspectorPort = Number(env.EXPORT_INSPECTOR_PORT ?? 9253)
  for (const value of [port, inspectorPort]) {
    if (!Number.isInteger(value) || value < 1024 || value > 65535)
      throw Error('Export ports must be integers between 1024 and 65535')
  }
  if (port === inspectorPort) throw Error('Export and inspector ports must differ')
  return {
    port,
    inspectorPort,
    persistPath: resolve(
      import.meta.dir,
      env.EXPORT_PERSIST_PATH ?? '../../.local/d1/dev',
    ),
  }
}

/** Refuse to displace an existing server or its supervisor.
 * @param port Local listener to check.
 * @returns Completion when the port is available.
 */
async function requireAvailablePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', () =>
      reject(
        Error(
          `Exports cannot start: TCP port ${port} is already in use or unavailable.`,
        ),
      ),
    )
    server.listen(port, '127.0.0.1', () =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  })
}

if (import.meta.main) {
  const settings = exportDevSettings(process.env)
  await requireAvailablePort(settings.port)
  await requireAvailablePort(settings.inspectorPort)
  // Keep the local preparation credential separate from all cloud credentials.
  const vars = resolve(import.meta.dir, '.dev.vars.preview')
  if (!existsSync(vars))
    writeFileSync(
      vars,
      `EXPORT_PUBLISH_KEY=${JSON.stringify(randomBytes(32).toString('hex'))}\n`,
      { mode: 0o600, flag: 'wx' },
    )
  const child = Bun.spawn(
    [
      'bun',
      'x',
      'wrangler',
      'dev',
      '--local',
      '--env',
      'preview',
      '--ip',
      '127.0.0.1',
      '--port',
      String(settings.port),
      // Wrangler otherwise derives download URLs from the hosted preview route.
      '--local-upstream',
      `127.0.0.1:${settings.port}`,
      '--inspector-port',
      String(settings.inspectorPort),
      '--persist-to',
      settings.persistPath,
    ],
    { cwd: import.meta.dir, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
  )
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => child.kill(signal))
  process.exit(await child.exited)
}
