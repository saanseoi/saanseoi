export type StatisticsReferencePeriod = {
  code: string
  end: string | null
  endYear: string
  granularity: 'year' | 'quarter' | 'half-year' | 'month' | 'multi-year' | 'unknown'
  start: string | null
}

/**
 * Preserves the publisher's exact period code while deriving the routing year
 * and unambiguous calendar bounds used by canonical statistics.
 */
export function parseStatisticsReferencePeriod(
  referencePeriodCode: string,
): StatisticsReferencePeriod {
  const code = referencePeriodCode.trim()
  if (!code) throw new Error('A statistics reference period code is required.')

  const calendarYear = /^(\d{4})$/.exec(code)
  if (calendarYear?.[1]) {
    return bounded(code, 'year', calendarYear[1], 1, 1, 12, 31)
  }

  const quarter = /^(\d{4})-Q([1-4])$/i.exec(code)
  if (quarter?.[1] && quarter[2]) {
    const quarterNumber = Number(quarter[2])
    const startMonth = (quarterNumber - 1) * 3 + 1
    const endMonth = startMonth + 2
    return bounded(
      code,
      'quarter',
      quarter[1],
      startMonth,
      1,
      endMonth,
      lastDayOfMonth(Number(quarter[1]), endMonth),
    )
  }

  const halfYear = /^(\d{4})-H([12])$/i.exec(code)
  if (halfYear?.[1] && halfYear[2]) {
    const firstHalf = halfYear[2] === '1'
    return bounded(
      code,
      'half-year',
      halfYear[1],
      firstHalf ? 1 : 7,
      1,
      firstHalf ? 6 : 12,
      firstHalf ? 30 : 31,
    )
  }

  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(code)
  if (month?.[1] && month[2]) {
    const monthNumber = Number(month[2])
    return bounded(
      code,
      'month',
      month[1],
      monthNumber,
      1,
      monthNumber,
      lastDayOfMonth(Number(month[1]), monthNumber),
    )
  }

  const shortYearSpan = /^(\d{4})\/(\d{2})$/.exec(code)
  if (shortYearSpan?.[1] && shortYearSpan[2]) {
    const startYear = Number(shortYearSpan[1])
    let endYear = Math.floor(startYear / 100) * 100 + Number(shortYearSpan[2])
    if (endYear < startYear) endYear += 100
    return unbounded(code, 'multi-year', String(endYear))
  }

  const yearSpan = /^(\d{4})\s*[-\u2013]\s*(\d{4})$/.exec(code)
  if (yearSpan?.[1] && yearSpan[2]) {
    if (Number(yearSpan[2]) < Number(yearSpan[1])) {
      throw new Error(`Statistics reference period ${code} ends before it starts.`)
    }
    return unbounded(code, 'multi-year', yearSpan[2])
  }

  const years = [...code.matchAll(/(?:^|\D)(\d{4})(?=\D|$)/g)].map(match => match[1])
  const endYear = years.at(-1)
  if (!endYear) {
    throw new Error(
      `Could not derive a reference-period end year from ${referencePeriodCode}.`,
    )
  }
  return unbounded(code, 'unknown', endYear)
}

function bounded(
  code: string,
  granularity: StatisticsReferencePeriod['granularity'],
  year: string,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): StatisticsReferencePeriod {
  return {
    code,
    end: isoDate(year, endMonth, endDay),
    endYear: year,
    granularity,
    start: isoDate(year, startMonth, startDay),
  }
}

function unbounded(
  code: string,
  granularity: StatisticsReferencePeriod['granularity'],
  endYear: string,
): StatisticsReferencePeriod {
  return { code, end: null, endYear, granularity, start: null }
}

function isoDate(year: string, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
