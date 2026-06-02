import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const datasets = sqliteTable(
  "datasets",
  {
    datasetId: text("datasetId").primaryKey(),
    regionCode: text("regionCode").notNull(),
    snapshotMonth: text("snapshotMonth").notNull(),
    theme: text("theme").notNull(),
    source: text("source").notNull(),
    sourceVersion: text("sourceVersion").notNull(),
    rawObjectKey: text("rawObjectKey").notNull(),
    status: text("status").notNull(),
    isActive: integer("isActive", { mode: "boolean" }).notNull(),
    supersedesDatasetId: text("supersedesDatasetId"),
    revokedAt: text("revokedAt"),
    revocationReason: text("revocationReason"),
    ingestedAt: text("ingestedAt").notNull(),
  },
  (table) => ({
    activeLookupIdx: index("datasets_active_lookup_idx").on(
      table.regionCode,
      table.snapshotMonth,
      table.theme,
      table.isActive,
    ),
    monthThemeUniqueIdx: uniqueIndex("datasets_dataset_id_unique_idx").on(table.datasetId),
  }),
);

export const ingestRuns = sqliteTable("ingestRuns", {
  runId: text("runId").primaryKey(),
  datasetId: text("datasetId")
    .notNull()
    .references(() => datasets.datasetId),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  statsJson: text("statsJson"),
  errorJson: text("errorJson"),
  startedAt: text("startedAt").notNull(),
  finishedAt: text("finishedAt"),
});

export const entityVersions = sqliteTable(
  "entityVersions",
  {
    regionCode: text("regionCode").notNull(),
    theme: text("theme").notNull(),
    entityId: text("entityId").notNull(),
    datasetId: text("datasetId")
      .notNull()
      .references(() => datasets.datasetId),
    featureType: text("featureType").notNull(),
    otVersion: text("otVersion").notNull(),
    versionHash: text("versionHash").notNull(),
    validFromMonth: text("validFromMonth").notNull(),
    validToMonth: text("validToMonth"),
    isCurrent: integer("isCurrent", { mode: "boolean" }).notNull(),
    geometryType: text("geometryType").notNull(),
    otBboxJson: text("otBboxJson"),
    payloadJson: text("payloadJson").notNull(),
    sourcesJson: text("sourcesJson"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.regionCode, table.theme, table.entityId, table.versionHash],
    }),
    currentLookupIdx: index("entityVersions_current_lookup_idx").on(
      table.regionCode,
      table.theme,
      table.entityId,
      table.isCurrent,
    ),
    validityIdx: index("entityVersions_validity_idx").on(
      table.regionCode,
      table.theme,
      table.validFromMonth,
      table.validToMonth,
    ),
    datasetIdx: index("entityVersions_dataset_idx").on(table.datasetId),
  }),
);

export const entityAliases = sqliteTable(
  "entityAliases",
  {
    aliasId: text("aliasId").primaryKey(),
    entityType: text("entityType").notNull(),
    aliasValue: text("aliasValue").notNull(),
    canonicalId: text("canonicalId").notNull(),
    sourceSystem: text("sourceSystem").notNull(),
    isCurrent: integer("isCurrent", { mode: "boolean" }).notNull(),
    validFromMonth: text("validFromMonth"),
    validToMonth: text("validToMonth"),
    notes: text("notes"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => ({
    aliasUniqueIdx: uniqueIndex("entityAliases_entityType_aliasValue_unique_idx").on(
      table.entityType,
      table.aliasValue,
    ),
    canonicalLookupIdx: index("entityAliases_canonical_lookup_idx").on(table.entityType, table.canonicalId),
  }),
);
