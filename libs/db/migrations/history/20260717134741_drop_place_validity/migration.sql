DROP INDEX IF EXISTS `places_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_validity_idx`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `validToCohortKey`;
