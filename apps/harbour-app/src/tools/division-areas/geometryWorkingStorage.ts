async function openWorkingDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('division-area-working-drawings', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drawings')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readGeometryState<T>(
  key: string,
): Promise<{ current: T; undo: T | null } | null> {
  const db = await openWorkingDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('drawings', 'readonly')
        .objectStore('drawings')
        .get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
/** Current drawing and Undo change together, only when the transaction commits. */
export async function writeGeometryState<T>(key: string, current: T, undo: T | null) {
  const db = await openWorkingDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drawings', 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Drawing save aborted'))
      transaction.objectStore('drawings').put({ current, undo }, key)
    })
    localStorage.removeItem(key)
    localStorage.removeItem(`${key}:before-topology-cleanup`)
  } finally {
    db.close()
  }
}
