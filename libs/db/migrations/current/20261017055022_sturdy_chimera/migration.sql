ALTER TABLE `addressPublicationState` ADD `divisionSnapshotId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `addressRole` text;--> statement-breakpoint
ALTER TABLE `placePublicationState` ADD `divisionSnapshotId` text;--> statement-breakpoint
ALTER TABLE `placePublicationState` ADD `addressSnapshotId` text;--> statement-breakpoint
ALTER TABLE `placePublicationState` ADD `supplementaryAddressSnapshotId` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_places` (
	`scopeId` text NOT NULL,
	`id` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`addressDependencyHash` text,
	`addressRole` text,
	`address2dId` text,
	`address3dId` text,
	`address3dUnitId` text,
	`address3dMembership` text,
	`countryId` text,
	`areaId` text,
	`districtId` text,
	`townId` text,
	`ruralAreaId` text,
	`macrohoodId` text,
	`neighbourhoodId` text,
	`villageId` text,
	`microhoodId` text,
	`hamletId` text,
	`islandId` text,
	`geometry` text NOT NULL,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`identifiers` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sources` text,
	`firstSeenMonth` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`scopeId`, `id`),
	CONSTRAINT "places_address3d_unit_reference_chk" CHECK(("address3dId" IS NULL AND "address3dUnitId" IS NULL AND "address3dMembership" IS NULL) OR ("address3dId" IS NOT NULL AND "address3dUnitId" IS NOT NULL AND "address3dMembership" IS NOT NULL AND "address2dId" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_places`(`scopeId`, `id`, `resourceReleaseId`, `addressDependencyHash`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId`, `islandId`, `geometry`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `identifiers`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `createdAt`) SELECT `scopeId`, `id`, `resourceReleaseId`, `addressDependencyHash`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId`, `islandId`, `geometry`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `identifiers`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `createdAt` FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `places_countryId_id_idx` ON `places` (`scopeId`,`countryId`,`id`);--> statement-breakpoint
CREATE INDEX `places_areaId_id_idx` ON `places` (`scopeId`,`areaId`,`id`);--> statement-breakpoint
CREATE INDEX `places_districtId_id_idx` ON `places` (`scopeId`,`districtId`,`id`);--> statement-breakpoint
CREATE INDEX `places_townId_id_idx` ON `places` (`scopeId`,`townId`,`id`);--> statement-breakpoint
CREATE INDEX `places_ruralAreaId_id_idx` ON `places` (`scopeId`,`ruralAreaId`,`id`);--> statement-breakpoint
CREATE INDEX `places_macrohoodId_id_idx` ON `places` (`scopeId`,`macrohoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_neighbourhoodId_id_idx` ON `places` (`scopeId`,`neighbourhoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_villageId_id_idx` ON `places` (`scopeId`,`villageId`,`id`);--> statement-breakpoint
CREATE INDEX `places_microhoodId_id_idx` ON `places` (`scopeId`,`microhoodId`,`id`);--> statement-breakpoint
CREATE INDEX `places_hamletId_id_idx` ON `places` (`scopeId`,`hamletId`,`id`);--> statement-breakpoint
CREATE INDEX `places_islandId_id_idx` ON `places` (`scopeId`,`islandId`,`id`);--> statement-breakpoint
CREATE INDEX `places_resourceReleaseId_idx` ON `places` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `places_category_id_idx` ON `places` (`scopeId`,`basicCategory`,`id`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_id_idx` ON `places` (`scopeId`,`taxonomyPrimary`,`id`);--> statement-breakpoint
CREATE INDEX `places_status_id_idx` ON `places` (`scopeId`,`operatingStatus`,`id`);--> statement-breakpoint
DROP TABLE `placeDivisionDefinitions`;