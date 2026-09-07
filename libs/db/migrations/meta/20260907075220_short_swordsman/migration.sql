CREATE TABLE `releaseProcessingActionChunks` (
	`id` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`actionId` text NOT NULL,
	`generation` text NOT NULL,
	`firstOrdinal` integer NOT NULL,
	`decisionCount` integer NOT NULL,
	`part` integer NOT NULL,
	`parts` integer NOT NULL,
	`encoding` text NOT NULL,
	`checksum` text NOT NULL,
	`payload` blob NOT NULL,
	CONSTRAINT `fk_releaseProcessingActionChunks_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE,
	CONSTRAINT "releaseProcessingActionChunks_payload_chk" CHECK(length("payload") <= 32768)
);
--> statement-breakpoint
ALTER TABLE `releaseProcessingActions` ADD `generation` text NOT NULL;--> statement-breakpoint
ALTER TABLE `releaseProcessingActions` ADD `decisionCount` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `releaseProcessingActionChunks_page_idx` ON `releaseProcessingActionChunks` (`actionId`,`generation`,`firstOrdinal`,`part`);--> statement-breakpoint
CREATE INDEX `releaseProcessingActionChunks_release_idx` ON `releaseProcessingActionChunks` (`releaseId`);--> statement-breakpoint
ALTER TABLE `releaseProcessingActions` DROP COLUMN `summary`;--> statement-breakpoint
ALTER TABLE `releaseProcessingActions` DROP COLUMN `evidence`;