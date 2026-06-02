import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const division = sqliteTable(
  "division",
  {
    id: text("id").primaryKey(),
    level: integer("level").notNull(),
    otVersion: text("otVersion"),
    otSubtype: text("otSubtype"),
    otAdminLevel: text("otAdminLevel"),
    otClass: text("otClass"),
    otWikidata: text("otWikidata"),
    otHierarchyJson: text("otHierarchyJson"),
    hierarchyJson: text("hierarchyJson"),
    parentDivisionId: text("parentDivisionId"),
    otCartographyJson: text("otCartographyJson"),
    otBboxJson: text("otBboxJson"),
    sourcesJson: text("sourcesJson"),
  },
  (table) => ({
    levelIdx: index("division_level_idx").on(table.level),
    parentIdx: index("division_parentDivisionId_idx").on(table.parentDivisionId),
  }),
);

export const divisionI18n = sqliteTable(
  "divisionI18n",
  {
    divisionId: text("divisionId")
      .notNull()
      .references(() => division.id),
    locale: text("locale").notNull(),
    otName: text("otName"),
    otNameVariantJson: text("otNameVariantJson"),
    otNameAlts: text("otNameAlts"),
    otLocalType: text("otLocalType"),
    hierarchyJson: text("hierarchyJson"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.divisionId, table.locale],
    }),
    localeIdx: index("divisionI18n_locale_idx").on(table.locale),
    nameIdx: index("divisionI18n_name_idx").on(table.locale, table.otName),
  }),
);
