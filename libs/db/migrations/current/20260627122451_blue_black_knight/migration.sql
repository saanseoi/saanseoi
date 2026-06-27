CREATE TABLE `divisions` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`population` integer,
	`subtype` text,
	`class` text,
	`wikidata` text,
	`hierarchy` text,
	`parentDivisionId` text,
	`cartography` text,
	`sources` text,
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
	`localType` text,
	`isLocaleInferred` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`snapshotId`, `divisionId`, `locale`),
	CONSTRAINT `divisionsI18n_snapshotId_divisionId_divisions_fk` FOREIGN KEY (`snapshotId`,`divisionId`) REFERENCES `divisions`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `address2d` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`divisionSnapshotId` text NOT NULL,
	`countryId` text,
	`areaId` text,
	`districtId` text,
	`townId` text,
	`macrohoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`hamletId` text,
	`microhoodId` text,
	`streetSnapshotId` text,
	`streetId` text,
	`identifiers` text,
	`sources` text,
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
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`snapshotId` text NOT NULL,
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
	`buildingName` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`blockType` text,
	`blockNumber` text,
	`blockTypeBeforeNumber` integer,
	`phaseName` text,
	`phaseNumber` text,
	`estateName` text,
	`streetNumber` text,
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
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`snapshotId`, `address3dId`, `locale`),
	CONSTRAINT `address3dI18n_snapshotId_address3dId_address3d_fk` FOREIGN KEY (`snapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`yearBuilt` text,
	`references` text,
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
	`regionCode` text NOT NULL,
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
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`lastSeenMonth` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT `places_addressSnapshotId_address2dId_address2d_fk` FOREIGN KEY (`addressSnapshotId`,`address2dId`) REFERENCES `address2d`(`snapshotId`,`id`),
	CONSTRAINT `places_addressSnapshotId_address3dId_address3d_fk` FOREIGN KEY (`addressSnapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`)
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`snapshotId` text NOT NULL,
	`regionCode` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`snapshotId`, `regionCode`, `id`, `h3Level`, `h3Cell`),
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
CREATE VIRTUAL TABLE `placesFts` USING fts5(
	`snapshotId` UNINDEXED,
	`placeId` UNINDEXED,
	`locale` UNINDEXED,
	`nameText`,
	`brandText`,
	`taxonomyText`,
	`addressText`,
	`divisionText`,
	`streetText`
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
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);--> statement-breakpoint
CREATE INDEX `divisions_parentDivisionId_idx` ON `divisions` (`parentDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`snapshotId`,`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`snapshotId`,`locale`,`name`);--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`divisionSnapshotId`,`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`snapshotId`,`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressSnapshotId`,`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`regionCode`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`regionCode`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`regionCode`,`operatingStatus`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`snapshotId`,`regionCode`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionSnapshotId`,`divisionId`,`placeSnapshotId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);
