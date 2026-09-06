DROP INDEX IF EXISTS `address3d_address2dId_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `address3d_snapshot_owner_unique` ON `address3d` (`snapshotId`,`address2dId`);