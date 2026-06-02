type DatasetFilters = {
  regionCode?: string;
  snapshotMonth?: string;
  theme?: string;
  status?: string;
  isActive?: boolean;
  limit?: number;
};

type PlaceLookup = {
  regionCode: string;
  placeId: string;
};

type I18nLookup = {
  placeId: string;
  locale?: string;
};

type H3Lookup = {
  regionCode: string;
  h3Level: number;
  h3Cell: string;
  limit?: number;
};

type FtsLookup = {
  regionCode: string;
  locale?: string;
  query: string;
  limit?: number;
};

export async function listDatasets(binding: D1Database, filters: DatasetFilters = {}) {
  const clauses = ['1 = 1'];
  const bindings: Array<string | number> = [];

  if (filters.regionCode) {
    clauses.push('"regionCode" = ?');
    bindings.push(filters.regionCode);
  }

  if (filters.snapshotMonth) {
    clauses.push('"snapshotMonth" = ?');
    bindings.push(filters.snapshotMonth);
  }

  if (filters.theme) {
    clauses.push('"theme" = ?');
    bindings.push(filters.theme);
  }

  if (filters.status) {
    clauses.push('"status" = ?');
    bindings.push(filters.status);
  }

  if (typeof filters.isActive === "boolean") {
    clauses.push('"isActive" = ?');
    bindings.push(filters.isActive ? 1 : 0);
  }

  const sqlText = `
    SELECT *
    FROM "datasets"
    WHERE ${clauses.join(" AND ")}
    ORDER BY "snapshotMonth" DESC, "ingestedAt" DESC
    LIMIT ?
  `;

  const result = await binding
    .prepare(sqlText)
    .bind(...bindings, filters.limit ?? 100)
    .all();

  return result.results;
}

export async function getPlaceCurrent(binding: D1Database, lookup: PlaceLookup) {
  return binding
    .prepare(
      `
        SELECT *
        FROM "placesCurrent"
        WHERE "regionCode" = ?
          AND "id" = ?
        LIMIT 1
      `,
    )
    .bind(lookup.regionCode, lookup.placeId)
    .first();
}

export async function listPlaceI18n(binding: D1Database, lookup: I18nLookup) {
  const localeSql = lookup.locale ? 'AND "locale" = ?' : "";
  const bindings = lookup.locale ? [lookup.placeId, lookup.locale] : [lookup.placeId];
  const result = await binding
    .prepare(
      `
        SELECT *
        FROM "placesCurrentI18n"
        WHERE "placeId" = ?
          ${localeSql}
        ORDER BY "locale"
      `,
    )
    .bind(...bindings)
    .all();

  return result.results;
}

export async function listPlaceDivisions(binding: D1Database, lookup: I18nLookup) {
  const localeSql = lookup.locale ? 'AND di."locale" = ?' : "";
  const bindings = lookup.locale ? [lookup.locale, lookup.placeId] : [lookup.placeId];
  const result = await binding
    .prepare(
      `
        SELECT
          d."id" AS "divisionId",
          d."level" AS "level",
          d."parentDivisionId" AS "parentDivisionId",
          di."locale" AS "locale",
          di."otName" AS "otName",
          di."otLocalType" AS "otLocalType"
        FROM "placesCurrentDivision" pcd
        INNER JOIN "division" d
          ON d."id" = pcd."divisionId"
        LEFT JOIN "divisionI18n" di
          ON di."divisionId" = d."id"
          ${localeSql}
        WHERE pcd."placeId" = ?
        ORDER BY d."level", di."locale"
      `,
    )
    .bind(...bindings)
    .all();

  return result.results;
}

export async function listPlacesByH3Cell(binding: D1Database, lookup: H3Lookup) {
  const result = await binding
    .prepare(
      `
        SELECT
          p."id" AS "placeId",
          p."datasetId" AS "datasetId",
          p."regionCode" AS "regionCode",
          p."otVersion" AS "otVersion",
          p."otVersionHash" AS "otVersionHash",
          p."otBasicCategory" AS "otBasicCategory",
          p."otTaxonomyPrimary" AS "otTaxonomyPrimary",
          p."otOperatingStatus" AS "otOperatingStatus",
          p."otLat" AS "otLat",
          p."otLng" AS "otLng",
          c."h3Level" AS "h3Level",
          c."h3Cell" AS "h3Cell"
        FROM "placesCurrentCells" c
        INNER JOIN "placesCurrent" p
          ON p."id" = c."id"
        WHERE c."regionCode" = ?
          AND c."h3Level" = ?
          AND c."h3Cell" = ?
        LIMIT ?
      `,
    )
    .bind(lookup.regionCode, lookup.h3Level, lookup.h3Cell, lookup.limit ?? 50)
    .all();

  return result.results;
}

export async function searchPlacesFts(binding: D1Database, lookup: FtsLookup) {
  const localeSql = lookup.locale ? 'AND f."locale" = ?' : "";
  const sqlText = `
    SELECT
      p."id" AS "placeId",
      p."regionCode" AS "regionCode",
      p."datasetId" AS "datasetId",
      f."locale" AS "locale",
      f."nameText" AS "nameText",
      f."brandText" AS "brandText"
    FROM "placesCurrentFts" f
    INNER JOIN "placesCurrent" p
      ON p."id" = f."placeId"
    WHERE p."regionCode" = ?
      ${localeSql}
      AND "placesCurrentFts" MATCH ?
    LIMIT ?
  `;

  const bindings = lookup.locale
    ? [lookup.regionCode, lookup.locale, lookup.query, lookup.limit ?? 20]
    : [lookup.regionCode, lookup.query, lookup.limit ?? 20];

  try {
    const result = await binding
      .prepare(sqlText)
      .bind(...bindings)
      .all<{
        placeId: string;
        regionCode: string;
        datasetId: string;
        locale: string;
        nameText: string | null;
        brandText: string | null;
      }>();

    return result.results;
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table: placesCurrentFts')) {
      throw new Error("FTS index is not initialized. Rebuild placesCurrentFts before using search.");
    }

    throw error;
  }
}
