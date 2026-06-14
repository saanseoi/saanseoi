CREATE TABLE `divisions` (
	`id` text PRIMARY KEY,
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
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
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
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`divisionId`, `locale`),
	CONSTRAINT `fk_divisionsI18n_divisionId_divisions_id_fk` FOREIGN KEY (`divisionId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address2d` (
	`id` text PRIMARY KEY,
	`geometry` text,
	`bbox` text,
	`countryId` text,
	`areaId` text,
	`districtId` text,
	`townId` text,
	`macrohoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`hamletId` text,
	`microhoodId` text,
	`streetId` text,
	`identifiers` text,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_address2d_countryId_divisions_id_fk` FOREIGN KEY (`countryId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_areaId_divisions_id_fk` FOREIGN KEY (`areaId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_districtId_divisions_id_fk` FOREIGN KEY (`districtId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_townId_divisions_id_fk` FOREIGN KEY (`townId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_macrohoodId_divisions_id_fk` FOREIGN KEY (`macrohoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_villageId_divisions_id_fk` FOREIGN KEY (`villageId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_neighbourhoodId_divisions_id_fk` FOREIGN KEY (`neighbourhoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_hamletId_divisions_id_fk` FOREIGN KEY (`hamletId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_microhoodId_divisions_id_fk` FOREIGN KEY (`microhoodId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
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
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `locale`),
	CONSTRAINT `fk_address2dI18n_addressId_address2d_id_fk` FOREIGN KEY (`addressId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`id` text PRIMARY KEY,
	`address2dId` text NOT NULL,
	`sources` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_address3d_address2dId_address2d_id_fk` FOREIGN KEY (`address2dId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
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
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `locale`),
	CONSTRAINT `fk_address3dI18n_address3dId_address3d_id_fk` FOREIGN KEY (`address3dId`) REFERENCES `address3d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`id` text PRIMARY KEY,
	`yearBuilt` text,
	`references` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `streetsAddress` (
	`streetId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetId`, `addressId`),
	CONSTRAINT `fk_streetsAddress_streetId_streets_id_fk` FOREIGN KEY (`streetId`) REFERENCES `streets`(`id`),
	CONSTRAINT `fk_streetsAddress_addressId_address2d_id_fk` FOREIGN KEY (`addressId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
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
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `locale`),
	CONSTRAINT `fk_streetsI18n_streetId_streets_id_fk` FOREIGN KEY (`streetId`) REFERENCES `streets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY,
	`regionCode` text NOT NULL,
	`releaseId` text NOT NULL,
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
	CONSTRAINT `fk_places_address2dId_address2d_id_fk` FOREIGN KEY (`address2dId`) REFERENCES `address2d`(`id`),
	CONSTRAINT `fk_places_address3dId_address3d_id_fk` FOREIGN KEY (`address3dId`) REFERENCES `address3d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`regionCode` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`regionCode`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `fk_placesCells_id_places_id_fk` FOREIGN KEY (`id`) REFERENCES `places`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesDivision` (
	`placeId` text NOT NULL,
	`divisionId` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeId`, `divisionId`),
	CONSTRAINT `fk_placesDivision_placeId_places_id_fk` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`),
	CONSTRAINT `fk_placesDivision_divisionId_divisions_id_fk` FOREIGN KEY (`divisionId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesFts` (
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
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`placeId`, `locale`),
	CONSTRAINT `fk_placesI18n_placeId_places_id_fk` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`)
);
--> statement-breakpoint
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);--> statement-breakpoint
CREATE INDEX `divisions_parentDivisionId_idx` ON `divisions` (`parentDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`regionCode`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`regionCode`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`regionCode`,`operatingStatus`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`regionCode`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`name`);