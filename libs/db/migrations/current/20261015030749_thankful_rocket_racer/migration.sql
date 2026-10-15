ALTER TABLE `placeDivisionDefinitions` ADD `id` text;--> statement-breakpoint
ALTER TABLE `places` ADD `countryId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `areaId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `districtId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `townId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `ruralAreaId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `macrohoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `neighbourhoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `villageId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `microhoodId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `hamletId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `landformId` text;--> statement-breakpoint
ALTER TABLE `places` ADD `divisionDefinitionSetId` text REFERENCES placeDivisionDefinitions(id);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placeDivisionDefinitions` (
	`id` text PRIMARY KEY,
	`definition` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_placeDivisionDefinitions`(`definition`) SELECT `definition` FROM `placeDivisionDefinitions`;--> statement-breakpoint
DROP TABLE `placeDivisionDefinitions`;--> statement-breakpoint
ALTER TABLE `__new_placeDivisionDefinitions` RENAME TO `placeDivisionDefinitions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `placesDivision_scope_division_place_idx`;--> statement-breakpoint
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
CREATE INDEX `places_landformId_id_idx` ON `places` (`scopeId`,`landformId`,`id`);--> statement-breakpoint
DROP TABLE `placesDivision`;