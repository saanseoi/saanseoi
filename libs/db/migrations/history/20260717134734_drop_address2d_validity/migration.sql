DROP INDEX IF EXISTS `address2d_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_validity_idx`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `validToCohortKey`;
