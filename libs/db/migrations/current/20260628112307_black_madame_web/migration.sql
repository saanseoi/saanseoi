PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2d` (
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
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`),
	CONSTRAINT "address2d_street_reference_consistency_chk" CHECK(("streetSnapshotId" IS NULL) = ("streetId" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_address2d`(`snapshotId`, `id`, `geometry`, `bbox`, `divisionSnapshotId`, `countryId`, `areaId`, `districtId`, `townId`, `macrohoodId`, `villageId`, `neighbourhoodId`, `hamletId`, `microhoodId`, `streetSnapshotId`, `streetId`, `identifiers`, `sources`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `geometry`, `bbox`, `divisionSnapshotId`, `countryId`, `areaId`, `districtId`, `townId`, `macrohoodId`, `villageId`, `neighbourhoodId`, `hamletId`, `microhoodId`, `streetSnapshotId`, `streetId`, `identifiers`, `sources`, `createdAt`, `updatedAt` FROM `address2d`;--> statement-breakpoint
DROP TABLE `address2d`;--> statement-breakpoint
ALTER TABLE `__new_address2d` RENAME TO `address2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_places` (
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
	CONSTRAINT `places_addressSnapshotId_address3dId_address3d_fk` FOREIGN KEY (`addressSnapshotId`,`address3dId`) REFERENCES `address3d`(`snapshotId`,`id`),
	CONSTRAINT "places_address_snapshot_required_chk" CHECK("addressSnapshotId" IS NOT NULL OR ("address2dId" IS NULL AND "address3dId" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_places`(`snapshotId`, `id`, `regionCode`, `releaseId`, `addressSnapshotId`, `address2dId`, `address3dId`, `lng`, `lat`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `brandWikidata`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `regionCode`, `releaseId`, `addressSnapshotId`, `address2dId`, `address3dId`, `lng`, `lat`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `brandWikidata`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `createdAt`, `updatedAt` FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`divisionSnapshotId`,`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);--> statement-breakpoint
CREATE INDEX `places_releaseId_idx` ON `places` (`releaseId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`regionCode`,`basicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`regionCode`,`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`regionCode`,`operatingStatus`);