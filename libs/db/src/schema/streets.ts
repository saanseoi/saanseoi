import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { address2d } from "./addresses";
import { datasets } from "./shared";

export const street = sqliteTable("street", {
  id: text("id").primaryKey(),
  yearBuiltJson: text("yearBuiltJson"),
  referencesJson: text("referencesJson"),
});

export const streetVersions = sqliteTable(
  "streetVersions",
  {
    id: text("id").notNull(),
    versionHash: text("versionHash").notNull(),
    datasetId: text("datasetId")
      .notNull()
      .references(() => datasets.datasetId),
    validFromMonth: text("validFromMonth").notNull(),
    validToMonth: text("validToMonth"),
    isCurrent: integer("isCurrent", { mode: "boolean" }).notNull(),
    yearBuiltJson: text("yearBuiltJson"),
    referencesJson: text("referencesJson"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.id, table.versionHash],
    }),
    currentLookupIdx: index("streetVersions_current_lookup_idx").on(table.id, table.isCurrent),
    validityIdx: index("streetVersions_validity_idx").on(table.validFromMonth, table.validToMonth),
    datasetIdx: index("streetVersions_datasetId_idx").on(table.datasetId),
  }),
);

export const streetI18n = sqliteTable(
  "streetI18n",
  {
    streetId: text("streetId")
      .notNull()
      .references(() => street.id),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    base: text("base"),
    designator: text("designator"),
    directionalPrefix: text("directionalPrefix"),
    directionalSuffix: text("directionalSuffix"),
    normalised: text("normalised"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.streetId, table.locale],
    }),
    localeIdx: index("streetI18n_locale_idx").on(table.locale),
    nameIdx: index("streetI18n_name_idx").on(table.locale, table.name),
  }),
);

export const streetVersionsI18n = sqliteTable(
  "streetVersionsI18n",
  {
    streetId: text("streetId").notNull(),
    versionHash: text("versionHash").notNull(),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    base: text("base"),
    designator: text("designator"),
    directionalPrefix: text("directionalPrefix"),
    directionalSuffix: text("directionalSuffix"),
    normalised: text("normalised"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.streetId, table.versionHash, table.locale],
    }),
    localeIdx: index("streetVersionsI18n_locale_idx").on(table.locale),
    nameIdx: index("streetVersionsI18n_name_idx").on(table.locale, table.name),
  }),
);

export const streetAddress = sqliteTable(
  "streetAddress",
  {
    streetId: text("streetId")
      .notNull()
      .references(() => street.id),
    addressId: text("addressId")
      .notNull()
      .references(() => address2d.id),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.streetId, table.addressId],
    }),
    addressIdx: index("streetAddress_addressId_idx").on(table.addressId),
  }),
);
