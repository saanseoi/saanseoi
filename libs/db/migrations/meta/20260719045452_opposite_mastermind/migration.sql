CREATE TABLE `releaseProcessingActions` (
	`id` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`action` text NOT NULL,
	`mode` text NOT NULL,
	`summary` text NOT NULL,
	`affectedRecordCount` integer NOT NULL,
	`evidence` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releaseProcessingActions_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `releaseProcessingActions_releaseId_idx` ON `releaseProcessingActions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `releaseProcessingActions_action_idx` ON `releaseProcessingActions` (`action`,`mode`);