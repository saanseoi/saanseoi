/** Archive full snapshots outside localStorage's small synchronous quota. */
export async function archiveGeometryBackup(key: string, previous: unknown) {
  const legacyKeys = Object.keys(localStorage).filter(
    name =>
      name.startsWith(`${key}:topology-backup:`) ||
      name.startsWith(`${key}:simplification-backup:`),
  )
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('division-area-geometry-backups', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Geometry backup transaction aborted.'))
      transaction.onerror = () => reject(transaction.error)
      const snapshots = transaction.objectStore('snapshots')
      for (const name of legacyKeys) {
        const value = localStorage.getItem(name)
        if (value !== null) snapshots.put(value, name)
      }
      snapshots.put(JSON.stringify(previous), `${key}:backup:${crypto.randomUUID()}`)
    })
    // A failed transaction leaves every original backup untouched.
    for (const name of legacyKeys) localStorage.removeItem(name)
  } finally {
    db.close()
  }
}

/** Read retained snapshots without replacing or deleting any working drawing. */
export async function readGeometryBackups(
  key: string,
): Promise<Array<{ key: string; value: unknown }>> {
  const existing = await indexedDB.databases()
  const history: Array<{ key: string; value: unknown }> = []
  if (existing.some(db => db.name === 'division-area-geometry-backups')) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('division-area-geometry-backups', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('snapshots', 'readonly')
        const request = transaction.objectStore('snapshots').openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          try {
            if (String(cursor.key).startsWith(`${key}:`))
              history.push({ key: String(cursor.key), value: JSON.parse(cursor.value) })
            cursor.continue()
          } catch (error) {
            reject(error)
            transaction.abort()
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      db.close()
    }
  }
  for (const name of Object.keys(localStorage))
    if (name.startsWith(`${key}:`)) {
      const raw = localStorage.getItem(name)
      if (!raw) continue
      try {
        const value = JSON.parse(raw)
        if (Array.isArray(value?.features)) history.push({ key: name, value })
      } catch {
        /* Not a snapshot. */
      }
    }
  return history
}
