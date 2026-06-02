import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { address2d } from "./addresses";

export const street = sqliteTable("street", {
  id: text("id").primaryKey(),
  yearBuiltJson: text("yearBuiltJson"),
  referencesJson: text("referencesJson"),
});

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
