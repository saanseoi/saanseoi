/** The joined publisher PLACE_NAME rows, with stored field-name conventions. */
export type LandsdPlaceName = {
  nameEn: string | null
  nameZhHant: string | null
  nameStatus: 'Official' | 'Alias'
}

/** Canonical/metric view only; SOURCE stores the publisher rows, not locale groups. */
export function landsdPlaceNameLocales(rows: LandsdPlaceName[]) {
  return Object.fromEntries(
    (
      [
        ['en', 'nameEn'],
        ['zh-hant', 'nameZhHant'],
      ] as const
    ).map(([locale, field]) => [
      locale,
      {
        official:
          rows.find(row => row.nameStatus === 'Official' && row[field] !== null)?.[
            field
          ] ?? null,
        alias: rows
          .filter(row => row.nameStatus === 'Alias')
          .flatMap(row => (row[field] === null ? [] : [row[field]!])),
      },
    ]),
  )
}
