import type { D1Database as WorkerD1Database } from '@cloudflare/workers-types'

declare global {
  // Shared schema types mention D1; keep Worker DOM types out of the browser app.
  type D1Database = WorkerD1Database
}
