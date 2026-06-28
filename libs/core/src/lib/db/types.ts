export type HarbourReadableDb = {
  select: (...args: any[]) => any
}

export type HarbourWritableDb = {
  delete: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
}
