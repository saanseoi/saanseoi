PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_datasetTransforms` (
	`datasetId` text NOT NULL,
	`code` text NOT NULL,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`outputVariant` text NOT NULL,
	`derivation` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `datasetTransforms_pk` PRIMARY KEY(`datasetId`, `code`, `sourceVersion`),
	CONSTRAINT `fk_datasetTransforms_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_datasetTransforms`(`datasetId`, `code`, `resourceType`, `sourceVersion`, `outputVariant`, `derivation`, `versionHash`, `createdAt`, `updatedAt`) SELECT `datasetId`, `code`, `resourceType`, `sourceVersion`, `outputVariant`, `derivation`, `versionHash`, `createdAt`, `updatedAt` FROM `datasetTransforms`;--> statement-breakpoint
DROP TABLE `datasetTransforms`;--> statement-breakpoint
ALTER TABLE `__new_datasetTransforms` RENAME TO `datasetTransforms`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `datasetTransforms_outputVariant_unique_idx`;--> statement-breakpoint
CREATE INDEX `datasetTransforms_resourceType_idx` ON `datasetTransforms` (`resourceType`);