CREATE TABLE `divisions` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`identifiers` text,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`sourceKeys` text,
	`wikidata` text,
	`hierarchy` text,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
	`snapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`isLocaleInferred` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`snapshotId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_snapshotId_divisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address2d` (
	`snapshotId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`streetSnapshotId` text,
	`id` text NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`identifiers` text,
	`sources` text,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `address2d_divisionSnapshotId_countryId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`countryId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_areaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`areaId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_districtId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`districtId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_townId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`townId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_macrohoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`macrohoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_villageId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`villageId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_neighbourhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`neighbourhoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_hamletId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`hamletId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_microhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`microhoodId`) REFERENCES `divisions`(`snapshotId`,`id`),
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`),
	CONSTRAINT "address2d_street_reference_consistency_chk" CHECK(("streetSnapshotId" IS NULL) = ("streetId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `address2dBuildingNumberLookup` (
	`snapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`snapshotId`, `addressId`, `buildingNumber`),
	CONSTRAINT `address2dBuildingNumberLookup_snapshotId_addressId_address2d_fk` FOREIGN KEY (`snapshotId`,`addressId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`snapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberExpression` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`buildingNumberConnector` text,
	`blockExpression` text,
	`blockType` text,
	`blockRef` text,
	`blockTypeBeforeNumber` integer,
	`phaseExpression` text,
	`phaseName` text,
	`phaseRef` text,
	`estateName` text,
	`streetName` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`snapshotId`, `addressId`, `locale`),
	CONSTRAINT `address2dI18n_snapshotId_addressId_address2d_fk` FOREIGN KEY (`snapshotId`,`addressId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`address2dId` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `address3d_snapshotId_address2dId_address2d_fk` FOREIGN KEY (`snapshotId`,`address2dId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`snapshotId` text NOT NULL,
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitExpression` text,
	`unitRef` text,
	`unitType` text,
	`floorExpression` text,
	`floorRef` text,
	`floorType` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`snapshotId`, `address3dId`, `locale`),
	CONSTRAINT `address3dI18n_snapshotId_address3dId_address3d_fk` FOREIGN KEY (`snapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address3dUnitRefLookup` (
	`snapshotId` text NOT NULL,
	`address3dId` text NOT NULL,
	`unitRef` text NOT NULL,
	`numericStem` text,
	`evidence` text NOT NULL,
	`derivation` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dUnitRefLookup_pk` PRIMARY KEY(`snapshotId`, `address3dId`, `unitRef`),
	CONSTRAINT `address3dUnitRefLookup_snapshotId_address3dId_address3d_fk` FOREIGN KEY (`snapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`yearBuilt` text,
	`references` text,
	`sourceKeys` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `streetsAddress` (
	`streetSnapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`addressSnapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetSnapshotId`, `streetId`, `addressSnapshotId`, `addressId`),
	CONSTRAINT `streetsAddress_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `streetsAddress_addressSnapshotId_addressId_address2d_fk` FOREIGN KEY (`addressSnapshotId`,`addressId`) REFERENCES `address2d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
	`snapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`snapshotId`, `streetId`, `locale`),
	CONSTRAINT `streetsI18n_snapshotId_streetId_streets_fk` FOREIGN KEY (`snapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `places` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`releaseId` text NOT NULL,
	`addressSnapshotId` text,
	`address2dId` text,
	`address3dId` text,
	`lng` real NOT NULL,
	`lat` real NOT NULL,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`brandWikidata` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sourceKeys` text,
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`lastSeenMonth` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `places_addressSnapshotId_address2dId_address2d_fk` FOREIGN KEY (`addressSnapshotId`,`address2dId`) REFERENCES `address2d`(`snapshotId`,`id`),
	CONSTRAINT `places_addressSnapshotId_address3dId_address3d_fk` FOREIGN KEY (`addressSnapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`),
	CONSTRAINT "places_address_snapshot_required_chk" CHECK("addressSnapshotId" IS NOT NULL OR ("address2dId" IS NULL AND "address3dId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`snapshotId`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `placesCells_snapshotId_id_places_fk` FOREIGN KEY (`snapshotId`,`id`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `placesDivision` (
	`placeSnapshotId` text NOT NULL,
	`placeId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`divisionId` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeSnapshotId`, `placeId`, `divisionSnapshotId`, `divisionId`),
	CONSTRAINT `placesDivision_placeSnapshotId_placeId_places_fk` FOREIGN KEY (`placeSnapshotId`,`placeId`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `placesDivision_divisionSnapshotId_divisionId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `placesFts` (
	`snapshotId` text NOT NULL,
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`nameText` text,
	`brandText` text,
	`taxonomyText` text,
	`addressText` text,
	`divisionText` text,
	`streetText` text
);
--> statement-breakpoint
CREATE TABLE `placesI18n` (
	`snapshotId` text NOT NULL,
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`snapshotId`, `placeId`, `locale`),
	CONSTRAINT `placesI18n_snapshotId_placeId_places_fk` FOREIGN KEY (`snapshotId`,`placeId`) REFERENCES `places`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `divisionAreas` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`divisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture' NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`isLand` integer,
	`isTerritorial` integer,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`snapshotId`,`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`snapshotId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`divisionSnapshotId`,`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_lookup_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`buildingNumber`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_numericStem_idx` ON `address2dBuildingNumberLookup` (`snapshotId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`snapshotId`,`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_lookup_idx` ON `address3dUnitRefLookup` (`snapshotId`,`unitRef`);--> statement-breakpoint
CREATE INDEX `address3dUnitRefLookup_numericStem_idx` ON `address3dUnitRefLookup` (`snapshotId`,`numericStem`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressSnapshotId`,`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`snapshotId`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`snapshotId`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`snapshotId`,`operatingStatus`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`snapshotId`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionSnapshotId`,`divisionId`,`placeSnapshotId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`snapshotId`,`divisionId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_type_idx` ON `divisionAreas` (`snapshotId`,`type`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`leftDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`snapshotId`,`rightDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_type_idx` ON `divisionBoundaries` (`snapshotId`,`type`);