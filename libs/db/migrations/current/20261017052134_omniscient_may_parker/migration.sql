ALTER TABLE `address2d` RENAME COLUMN `landformId` TO `islandId`;--> statement-breakpoint
ALTER TABLE `places` RENAME COLUMN `landformId` TO `islandId`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2d` (
	`scopeId` text NOT NULL,
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
	`ruralAreaId` text,
	`macrohoodId` text,
	`townId` text,
	`islandId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`identifiers` text,
	`sources` text,
	`geometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT `address2d_divisionSnapshotId_countryId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`countryId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_islandId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`islandId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_areaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`areaId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_districtId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`districtId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_townId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`townId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_ruralAreaId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`ruralAreaId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_macrohoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`macrohoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_villageId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`villageId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_neighbourhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`neighbourhoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_hamletId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`hamletId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_divisionSnapshotId_microhoodId_divisions_fk` FOREIGN KEY (`divisionSnapshotId`,`microhoodId`) REFERENCES `divisions`(`scopeId`,`id`),
	CONSTRAINT `address2d_streetSnapshotId_streetId_streets_fk` FOREIGN KEY (`streetSnapshotId`,`streetId`) REFERENCES `streets`(`scopeId`,`id`),
	CONSTRAINT "address2d_street_reference_consistency_chk" CHECK(("streetSnapshotId" IS NULL) = ("streetId" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_address2d`(`scopeId`, `divisionSnapshotId`, `streetSnapshotId`, `id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `ruralAreaId`, `macrohoodId`, `townId`, `islandId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `createdAt`) SELECT `scopeId`, `divisionSnapshotId`, `streetSnapshotId`, `id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `ruralAreaId`, `macrohoodId`, `townId`, `islandId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `createdAt` FROM `address2d`;--> statement-breakpoint
DROP TABLE `address2d`;--> statement-breakpoint
ALTER TABLE `__new_address2d` RENAME TO `address2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_landformId_scope_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_landformId_id_idx`;--> statement-breakpoint
CREATE INDEX `address2d_countryId_scope_id_idx` ON `address2d` (`countryId`,`scopeId`,`id`) WHERE "address2d"."countryId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_islandId_scope_id_idx` ON `address2d` (`islandId`,`scopeId`,`id`) WHERE "address2d"."islandId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_areaId_scope_id_idx` ON `address2d` (`areaId`,`scopeId`,`id`) WHERE "address2d"."areaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_districtId_scope_id_idx` ON `address2d` (`districtId`,`scopeId`,`id`) WHERE "address2d"."districtId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_townId_scope_id_idx` ON `address2d` (`townId`,`scopeId`,`id`) WHERE "address2d"."townId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_ruralAreaId_scope_id_idx` ON `address2d` (`ruralAreaId`,`scopeId`,`id`) WHERE "address2d"."ruralAreaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_macrohoodId_scope_id_idx` ON `address2d` (`macrohoodId`,`scopeId`,`id`) WHERE "address2d"."macrohoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_neighbourhoodId_scope_id_idx` ON `address2d` (`neighbourhoodId`,`scopeId`,`id`) WHERE "address2d"."neighbourhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_microhoodId_scope_id_idx` ON `address2d` (`microhoodId`,`scopeId`,`id`) WHERE "address2d"."microhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_villageId_scope_id_idx` ON `address2d` (`villageId`,`scopeId`,`id`) WHERE "address2d"."villageId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_hamletId_scope_id_idx` ON `address2d` (`hamletId`,`scopeId`,`id`) WHERE "address2d"."hamletId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`scopeId`,`parentAddressId`);--> statement-breakpoint
CREATE INDEX `address2d_divisionSnapshotId_idx` ON `address2d` (`divisionSnapshotId`);--> statement-breakpoint
CREATE INDEX `places_islandId_id_idx` ON `places` (`scopeId`,`islandId`,`id`);