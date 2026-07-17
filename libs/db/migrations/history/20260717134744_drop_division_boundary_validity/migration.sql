DROP INDEX IF EXISTS `divisionBoundaries_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionBoundaries_validity_idx`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `validToCohortKey`;
