export const formatReleaseStat = (
  locale: string,
  value: number,
  unit?: string | null,
) =>
  unit === 'percentage'
    ? new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        style: 'percent',
      }).format(value / 100)
    : new Intl.NumberFormat(
        locale,
        unit === 'kilometres' || unit === 'square_kilometres'
          ? { maximumSignificantDigits: 5 }
          : { maximumFractionDigits: 2 },
      ).format(value)
