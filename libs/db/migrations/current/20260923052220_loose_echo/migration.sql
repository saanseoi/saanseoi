DROP INDEX IF EXISTS `address2d_landformId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_division_idx`;--> statement-breakpoint
CREATE INDEX `address2d_countryId_idx` ON `address2d` (`countryId`) WHERE "address2d"."countryId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_landformId_lookup_idx` ON `address2d` (`landformId`) WHERE "address2d"."landformId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_areaId_idx` ON `address2d` (`areaId`) WHERE "address2d"."areaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_districtId_idx` ON `address2d` (`districtId`) WHERE "address2d"."districtId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_townId_idx` ON `address2d` (`townId`) WHERE "address2d"."townId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_macrohoodId_idx` ON `address2d` (`macrohoodId`) WHERE "address2d"."macrohoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_neighbourhoodId_idx` ON `address2d` (`neighbourhoodId`) WHERE "address2d"."neighbourhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_microhoodId_idx` ON `address2d` (`microhoodId`) WHERE "address2d"."microhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_villageId_idx` ON `address2d` (`villageId`) WHERE "address2d"."villageId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_hamletId_idx` ON `address2d` (`hamletId`) WHERE "address2d"."hamletId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_divisionSnapshotId_idx` ON `address2d` (`divisionSnapshotId`);