CREATE TABLE `snapshotShardAssignments` (
	`snapshotId` text NOT NULL,
	`dataShardId` text NOT NULL,
	CONSTRAINT `snapshotShardAssignments_pk` PRIMARY KEY(`snapshotId`, `dataShardId`),
	CONSTRAINT `fk_snapshotShardAssignments_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `snapshotShardAssignments_dataShardId_idx` ON `snapshotShardAssignments` (`dataShardId`);
--> statement-breakpoint
INSERT OR IGNORE INTO `snapshotShardAssignments` (`snapshotId`, `dataShardId`)
SELECT DISTINCT ss.`snapshotId`, rsa.`dataShardId`
FROM `snapshotSources` ss
JOIN `releaseShardAssignments` rsa ON rsa.`releaseId` = ss.`sourceReleaseId`
JOIN `dataShards` ds ON ds.`id` = rsa.`dataShardId`
WHERE ds.`shardType` = 'history';
