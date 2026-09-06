import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { unzipSafeArchive } from './zipArchive.ts'

const require = createRequire(import.meta.url)

/** Uses fgdb's row parser with projection disabled, without changing its cache. */
export function readNativeFileGeodatabaseArchive(bytes: Uint8Array) {
  const rowsPath = require.resolve('fgdb/lib/rows')
  const source = readFileSync(rowsPath, 'utf8')
  const needle = "var parseGeometry = require('./geometry');"
  if (!source.includes(needle)) throw new Error('Unexpected FileGDB geometry reader.')
  const patched = source.replace(
    needle,
    `${needle}
    var projectedGeometry = parseGeometry;
    parseGeometry = function(data, field) {
      return projectedGeometry(data, Object.assign({}, field, {
        meta: Object.assign({}, field.meta, { proj: null })
      }));
    };
  `,
  )
  const module = { exports: {} as unknown }
  // The adapter is pinned dependency code; the archive never supplies code.
  new Function('require', 'module', 'exports', patched)(
    createRequire(rowsPath),
    module,
    module.exports,
  )
  const readRows = module.exports as (table: ArrayBuffer, index: ArrayBuffer) => unknown
  const entries = unzipSafeArchive(bytes)
  const tables = new Map<number, { table?: Uint8Array; index?: Uint8Array }>()
  for (const [name, data] of Object.entries(entries)) {
    const match = /(?:^|\/)a([0-9a-f]{8})\.(gdbtable|gdbtablx)$/.exec(name)
    if (!match?.[1]) continue
    const id = Number.parseInt(match[1], 16)
    if (id !== 1 && id <= 8) continue
    const pair = tables.get(id) ?? {}
    pair[match[2] === 'gdbtable' ? 'table' : 'index'] = data
    tables.set(id, pair)
  }
  const ordered = [...tables].sort(([a], [b]) => a - b)
  const read = (index: number) => {
    const pair = ordered[index]?.[1]
    if (!pair?.table || !pair.index) throw new Error('Incomplete native FileGDB table.')
    return readRows(
      Uint8Array.from(pair.table).buffer,
      Uint8Array.from(pair.index).buffer,
    )
  }
  const catalogue = read(0) as Array<{ Name: string }>
  const names = catalogue.filter(row => !row.Name.startsWith('GDB_'))
  return Object.fromEntries(names.map((row, index) => [row.Name, read(index + 1)]))
}
