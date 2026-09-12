import { readdir, readlink } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Removing an open R2 SQLite database leaves Miniflare using deleted files. */
export async function assertLocalR2Stopped(repoRoot: string) {
  const prefix = `${resolve(repoRoot, '.local/d1/dev/v3/r2')}/`
  const owners = new Set<string>()
  if (process.platform === 'linux') {
    for (const pid of await readdir('/proc')) {
      if (!/^\d+$/.test(pid)) continue
      let descriptors: string[]
      try {
        descriptors = await readdir(`/proc/${pid}/fd`)
      } catch (error) {
        if (isInaccessibleProcess(error)) continue
        throw error
      }
      for (const fd of descriptors) {
        try {
          if ((await readlink(`/proc/${pid}/fd/${fd}`)).startsWith(prefix)) {
            owners.add(pid)
            break
          }
        } catch (error) {
          if (!isInaccessibleProcess(error)) throw error
        }
      }
    }
  } else {
    const child = Bun.spawn(['lsof', '-Fpn'], { stdout: 'pipe', stderr: 'pipe' })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (code !== 0 && (code !== 1 || stderr.trim()))
      throw new Error(`Cannot check local R2 owners: ${stderr.trim()}`)
    let pid = ''
    for (const line of stdout.split('\n')) {
      if (line.startsWith('p')) pid = line.slice(1)
      if (line.startsWith(`n${prefix}`)) owners.add(pid)
    }
  }
  if (owners.size)
    throw new Error(
      `Local R2 is open in processes ${[...owners].join(', ')}. Stop the local Harbour and SaanSeoi dev services before a full reset, then restart them afterwards.`,
    )
}

function isInaccessibleProcess(error: unknown) {
  return ['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(
    (error as NodeJS.ErrnoException).code ?? '',
  )
}
