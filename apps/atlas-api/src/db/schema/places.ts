import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { address2d, address3d } from "./addresses";
import { datasets } from "./shared";
import { division } from "./divisions";

export const placesCurrent = sqliteTable(
  "placesCurrent",
  {
    regionCode: text("regionCode").notNull(),
    datasetId: text("datasetId")
      .notNull()
      .references(() => datasets.datasetId),
    id: text("id").primaryKey(),
    address2dId: text("address2dId").references(() => address2d.id),
    address3dId: text("address3dId").references(() => address3d.id),
    otVersionHash: text("otVersionHash").notNull(),
    otVersion: text("otVersion").notNull(),
    otLng: real("otLng").notNull(),
    otLat: real("otLat").notNull(),
    otBboxJson: text("otBboxJson"),
    otOperatingStatus: text("otOperatingStatus"),
    otBasicCategory: text("otBasicCategory"),
    otTaxonomyPrimary: text("otTaxonomyPrimary"),
    otTaxonomyHierarchyJson: text("otTaxonomyHierarchyJson"),
    otTaxonomyAlternatesJson: text("otTaxonomyAlternatesJson"),
    otBrandWikidata: text("otBrandWikidata"),
    otWebsitesJson: text("otWebsitesJson"),
    otSocialsJson: text("otSocialsJson"),
    otEmailsJson: text("otEmailsJson"),
    otPhonesJson: text("otPhonesJson"),
    otAddressesJson: text("otAddressesJson"),
    otConfidence: real("otConfidence"),
    sourcesJson: text("sourcesJson"),
    firstSeenMonth: text("firstSeenMonth").notNull(),
    lastSeenMonth: text("lastSeenMonth").notNull(),
  },
  (table) => ({
    datasetIdx: index("placesCurrent_datasetId_idx").on(table.datasetId),
    categoryIdx: index("placesCurrent_category_idx").on(table.regionCode, table.otBasicCategory),
    taxonomyIdx: index("placesCurrent_taxonomy_idx").on(table.regionCode, table.otTaxonomyPrimary),
    statusIdx: index("placesCurrent_status_idx").on(table.regionCode, table.otOperatingStatus),
  }),
);

export const placesCurrentI18n = sqliteTable(
  "placesCurrentI18n",
  {
    placeId: text("placeId")
      .notNull()
      .references(() => placesCurrent.id),
    locale: text("locale").notNull(),
    otName: text("otName"),
    otNameVariantJson: text("otNameVariantJson"),
    otNameAlts: text("otNameAlts"),
    otBrandName: text("otBrandName"),
    otBrandNameVariantJson: text("otBrandNameVariantJson"),
    otBrandNameAlts: text("otBrandNameAlts"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.placeId, table.locale],
    }),
    localeIdx: index("placesCurrentI18n_locale_idx").on(table.locale),
    nameIdx: index("placesCurrentI18n_name_idx").on(table.locale, table.otName),
  }),
);

export const placesCurrentDivision = sqliteTable(
  "placesCurrentDivision",
  {
    placeId: text("placeId")
      .notNull()
      .references(() => placesCurrent.id),
    divisionId: text("divisionId")
      .notNull()
      .references(() => division.id),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.placeId, table.divisionId],
    }),
    divisionIdx: index("placesCurrentDivision_divisionId_idx").on(table.divisionId, table.placeId),
  }),
);

export const placesCurrentCells = sqliteTable(
  "placesCurrentCells",
  {
    regionCode: text("regionCode").notNull(),
    id: text("id")
      .notNull()
      .references(() => placesCurrent.id),
    h3Level: integer("h3Level").notNull(),
    h3Cell: text("h3Cell").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.regionCode, table.id, table.h3Level, table.h3Cell],
    }),
    cellIdx: index("placesCurrentCells_lookup_idx").on(table.regionCode, table.h3Level, table.h3Cell, table.id),
  }),
);
