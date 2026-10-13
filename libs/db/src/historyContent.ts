/** Payload shape after validating an upsert event; deletion rows never reach consumers. */
export type HistoryContent<History, Canonical> = Omit<
  History,
  keyof Canonical | 'versionHash' | 'sourceReleaseId' | 'operation'
> &
  Pick<Canonical, Extract<keyof Canonical, keyof History>> & {
    versionHash: string
    sourceReleaseId: string
    operation: 'upsert'
  }
