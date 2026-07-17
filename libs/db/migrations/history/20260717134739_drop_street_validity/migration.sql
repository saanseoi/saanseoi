DROP INDEX IF EXISTS `streets_snapshot_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streets_validity_idx`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `validFromSnapshotId`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `validToSnapshotId`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `validToCohortKey`;
