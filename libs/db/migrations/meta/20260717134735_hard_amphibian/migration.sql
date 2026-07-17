ALTER TABLE `snapshots` ADD `parentSnapshotId` text;--> statement-breakpoint
CREATE INDEX `snapshots_parentSnapshotId_idx` ON `snapshots` (`parentSnapshotId`);