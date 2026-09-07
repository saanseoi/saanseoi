import { createHash } from 'node:crypto'

const canonical = (value: any): string =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value)
          .sort()
          .map(k => `${JSON.stringify(k)}:${canonical(value[k])}`)
          .join(',')}}`
    : JSON.stringify(value)

export function estateGapIdentity(csu: string, en: any, zh: any) {
  const e = { ...en },
    z = { ...zh }
  delete e.EngEstate
  delete z.ChiEstate
  return createHash('sha256')
    .update(canonical([csu, e, z]))
    .digest('hex')
}
export type GapObservation = { count: number; enEstate: any; zhEstate: any }
export function boundedEstateGaps(series: Array<GapObservation | undefined>) {
  const result: Array<{
    from: number
    to: number
    before: number
    after: number
    enEstate: any
    zhEstate: any
  }> = []
  const missing = (o: GapObservation | undefined) =>
    o?.count === 1 && o.enEstate == null && o.zhEstate == null
  for (let i = 1; i < series.length; i++) {
    if (!missing(series[i]) || missing(series[i - 1])) continue
    let end = i
    while (missing(series[end + 1])) end++
    const a = series[i - 1],
      b = series[end + 1]
    if (
      a?.count === 1 &&
      b?.count === 1 &&
      a.enEstate?.EstateName &&
      a.zhEstate?.EstateName &&
      canonical(a.enEstate) === canonical(b.enEstate) &&
      canonical(a.zhEstate) === canonical(b.zhEstate)
    )
      result.push({
        from: i,
        to: end,
        before: i - 1,
        after: end + 1,
        enEstate: a.enEstate,
        zhEstate: a.zhEstate,
      })
    i = end
  }
  return result
}
