import {
  fileWriter,
  ParquetWriter,
  schemaFromColumnData,
  type ColumnSource,
} from 'hyparquet-writer'

// Only one row group's serialised columns should coexist with the prepared rows.
export async function writeAlsParquet<T>(options: {
  filename: string
  rows: T[]
  columnData: (rows: T[]) => ColumnSource[]
}) {
  const batchSize = 5000
  let writer: ParquetWriter | undefined
  for (let offset = 0; offset < Math.max(options.rows.length, 1); offset += batchSize) {
    const columnData = options.columnData(
      options.rows.slice(offset, offset + batchSize),
    )
    writer ??= new ParquetWriter({
      writer: fileWriter(options.filename),
      schema: schemaFromColumnData({ columnData }),
    })
    await writer.write({ columnData, rowGroupSize: batchSize })
  }
  await writer?.finish()
}
