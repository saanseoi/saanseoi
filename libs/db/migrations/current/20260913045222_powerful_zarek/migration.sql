ALTER TABLE `address2d` ADD `landformId` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2d` (
	`snapshotId` text NOT NULL,
	`divisionSnapshotId` text NOT NULL,
	`streetSnapshotId` text,
	`id` text NOT NULL,
	`parentAddressId` text,
	`granularity` text DEFAULT 'unknown' NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`landformId` text,
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
	CONSTRAINT `address2d_divisionSnapshotId_landformId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`landformId`) REFERENCES `divisions`(`snapshotId`,`id`),
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
INSERT INTO `__new_address2d`(`snapshotId`, `divisionSnapshotId`, `streetSnapshotId`, `id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `macrohoodId`, `townId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `bbox`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `divisionSnapshotId`, `streetSnapshotId`, `id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `macrohoodId`, `townId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `bbox`, `createdAt`, `updatedAt` FROM `address2d`;--> statement-breakpoint
DROP TABLE `address2d`;--> statement-breakpoint
ALTER TABLE `__new_address2d` RENAME TO `address2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `address2d_landformId_idx` ON `address2d` (`snapshotId`,`landformId`);--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`snapshotId`,`parentAddressId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`divisionSnapshotId`,`hamletId`,`microhoodId`,`villageId`,`neighbourhoodId`,`macrohoodId`,`townId`,`districtId`);