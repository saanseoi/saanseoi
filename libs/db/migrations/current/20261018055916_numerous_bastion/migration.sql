DROP INDEX IF EXISTS `places_countryId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_areaId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_districtId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_townId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_ruralAreaId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_macrohoodId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_neighbourhoodId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_villageId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_microhoodId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_hamletId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_islandId_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_category_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_taxonomy_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_status_id_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `placesI18n_name_idx`;--> statement-breakpoint
CREATE INDEX `places_countryId_id_nonnull_idx` ON `places` (`scopeId`,`countryId`,`id`) WHERE "places"."countryId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_areaId_id_nonnull_idx` ON `places` (`scopeId`,`areaId`,`id`) WHERE "places"."areaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_districtId_id_nonnull_idx` ON `places` (`scopeId`,`districtId`,`id`) WHERE "places"."districtId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_townId_id_nonnull_idx` ON `places` (`scopeId`,`townId`,`id`) WHERE "places"."townId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_ruralAreaId_id_nonnull_idx` ON `places` (`scopeId`,`ruralAreaId`,`id`) WHERE "places"."ruralAreaId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_macrohoodId_id_nonnull_idx` ON `places` (`scopeId`,`macrohoodId`,`id`) WHERE "places"."macrohoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_neighbourhoodId_id_nonnull_idx` ON `places` (`scopeId`,`neighbourhoodId`,`id`) WHERE "places"."neighbourhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_villageId_id_nonnull_idx` ON `places` (`scopeId`,`villageId`,`id`) WHERE "places"."villageId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_microhoodId_id_nonnull_idx` ON `places` (`scopeId`,`microhoodId`,`id`) WHERE "places"."microhoodId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_hamletId_id_nonnull_idx` ON `places` (`scopeId`,`hamletId`,`id`) WHERE "places"."hamletId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_islandId_id_nonnull_idx` ON `places` (`scopeId`,`islandId`,`id`) WHERE "places"."islandId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_category_id_nonnull_idx` ON `places` (`scopeId`,`basicCategory`,`id`) WHERE "places"."basicCategory" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_taxonomy_id_nonnull_idx` ON `places` (`scopeId`,`taxonomyPrimary`,`id`) WHERE "places"."taxonomyPrimary" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `places_status_id_nonnull_idx` ON `places` (`scopeId`,`operatingStatus`,`id`) WHERE "places"."operatingStatus" IS NOT NULL;