import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { division } from "./divisions";

export const address2d = sqliteTable(
  "address2d",
  {
    id: text("id").primaryKey(),
    canonicalKey: text("canonicalKey").notNull().unique(),
    streetId: text("streetId"),
    microhoodId: text("microhoodId").references(() => division.id),
    neighbourhoodId: text("neighbourhoodId").references(() => division.id),
    subDistrictId: text("subDistrictId").references(() => division.id),
    districtId: text("districtId").references(() => division.id),
    regionId: text("regionId").references(() => division.id),
    countryId: text("countryId").references(() => division.id),
    otLng: real("otLng").notNull(),
    otLat: real("otLat").notNull(),
    otStreet: text("otStreet"),
    otNumber: text("otNumber"),
    otBboxJson: text("otBboxJson"),
    otVersion: text("otVersion"),
    sourcesJson: text("sourcesJson"),
  },
  (table) => ({
    streetIdx: index("address2d_streetId_idx").on(table.streetId),
    divisionIdx: index("address2d_division_idx").on(
      table.microhoodId,
      table.neighbourhoodId,
      table.subDistrictId,
      table.districtId,
    ),
  }),
);

export const address2dI18n = sqliteTable(
  "address2dI18n",
  {
    addressId: text("addressId")
      .notNull()
      .references(() => address2d.id),
    locale: text("locale").notNull(),
    formattedAddress: text("formattedAddress").notNull(),
    buildingName: text("buildingName"),
    buildingNumberFrom: text("buildingNumberFrom"),
    buildingNumberTo: text("buildingNumberTo"),
    blockType: text("blockType"),
    blockNumber: text("blockNumber"),
    blockTypeBeforeNumber: integer("blockTypeBeforeNumber", { mode: "boolean" }),
    phaseName: text("phaseName"),
    phaseNumber: text("phaseNumber"),
    estateName: text("estateName"),
    streetNumber: text("streetNumber"),
    streetName: text("streetName"),
    intersection: text("intersection"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.addressId, table.locale],
    }),
    localeIdx: index("address2dI18n_locale_idx").on(table.locale),
  }),
);

export const address3d = sqliteTable(
  "address3d",
  {
    id: text("id").primaryKey(),
    address2dId: text("address2dId")
      .notNull()
      .references(() => address2d.id),
    sourcesJson: text("sourcesJson"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    address2dIdx: index("address3d_address2dId_idx").on(table.address2dId),
  }),
);

export const address3dI18n = sqliteTable(
  "address3dI18n",
  {
    address3dId: text("address3dId")
      .notNull()
      .references(() => address3d.id),
    locale: text("locale").notNull(),
    formattedAddressPart: text("formattedAddressPart").notNull(),
    accessHint: text("accessHint"),
    unitPortion: text("unitPortion"),
    unitNumber: text("unitNumber"),
    unitType: text("unitType"),
    floorNumber: text("floorNumber"),
    floorType: text("floorType"),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.address3dId, table.locale],
    }),
    localeIdx: index("address3dI18n_locale_idx").on(table.locale),
  }),
);
