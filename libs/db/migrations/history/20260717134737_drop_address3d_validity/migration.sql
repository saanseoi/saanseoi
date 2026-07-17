DROP INDEX IF EXISTS `address3d_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address3d_validity_idx`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `validToCohortKey`;
