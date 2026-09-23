DROP INDEX IF EXISTS `places_category_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_taxonomy_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `placesDivision_divisionId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisions_level_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `placesI18n_locale_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionsI18n_locale_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streetsI18n_locale_idx`;--> statement-breakpoint
CREATE INDEX `places_category_id_idx` ON `places` (`snapshotId`,`basicCategory`,`id`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_id_idx` ON `places` (`snapshotId`,`taxonomyPrimary`,`id`);--> statement-breakpoint
CREATE INDEX `places_status_id_idx` ON `places` (`snapshotId`,`operatingStatus`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_scope_division_place_idx` ON `placesDivision` (`placeSnapshotId`,`divisionId`,`placeId`);--> statement-breakpoint
CREATE INDEX `divisions_scope_order_idx` ON `divisions` (`snapshotId`,`level`,`class`,`id`);