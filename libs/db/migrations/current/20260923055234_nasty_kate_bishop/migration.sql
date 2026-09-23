DROP INDEX IF EXISTS `address2d_countryId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_landformId_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_areaId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_districtId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_townId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_macrohoodId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_neighbourhoodId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_microhoodId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_villageId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_hamletId_idx`;--> statement-breakpoint
CREATE INDEX `address2d_countryId_scope_id_idx` ON `address2d` (`countryId`,`snapshotId`,`id`) WHERE "address2d"."countryId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_landformId_scope_id_idx` ON `address2d` (`landformId`,`snapshotId`,`id`) WHERE "address2d"."landformId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_areaId_scope_id_idx` ON `address2d` (`areaId`,`snapshotId`,`id`) WHERE "address2d"."areaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_districtId_scope_id_idx` ON `address2d` (`districtId`,`snapshotId`,`id`) WHERE "address2d"."districtId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_townId_scope_id_idx` ON `address2d` (`townId`,`snapshotId`,`id`) WHERE "address2d"."townId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_macrohoodId_scope_id_idx` ON `address2d` (`macrohoodId`,`snapshotId`,`id`) WHERE "address2d"."macrohoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_neighbourhoodId_scope_id_idx` ON `address2d` (`neighbourhoodId`,`snapshotId`,`id`) WHERE "address2d"."neighbourhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_microhoodId_scope_id_idx` ON `address2d` (`microhoodId`,`snapshotId`,`id`) WHERE "address2d"."microhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_villageId_scope_id_idx` ON `address2d` (`villageId`,`snapshotId`,`id`) WHERE "address2d"."villageId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `address2d_hamletId_scope_id_idx` ON `address2d` (`hamletId`,`snapshotId`,`id`) WHERE "address2d"."hamletId" IS NOT NULL;