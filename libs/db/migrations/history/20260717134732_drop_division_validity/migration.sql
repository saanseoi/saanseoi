DROP INDEX IF EXISTS `divisions_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisions_validity_idx`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `validToCohortKey`;
