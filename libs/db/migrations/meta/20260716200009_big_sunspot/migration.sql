ALTER TABLE `apiCompositionMembers` RENAME COLUMN `selectionMode` TO `cohortMatchingMode`;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` RENAME COLUMN `selectionMode` TO `cohortMatchingMode`;--> statement-breakpoint
ALTER TABLE `apiComposition` ADD `defaultDomainCode` text;--> statement-breakpoint
ALTER TABLE `apiCompositionMembers` ADD `domainCode` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `apiCompositionMembers_pk` PRIMARY KEY(`apiCompositionId`, `domainCode`, `resourceType`, `variant`),
	CONSTRAINT `fk_apiCompositionMembers_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_apiCompositionMembers`(`apiCompositionId`, `resourceType`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `anchorResourceType`, `maxLagDays`, `priority`, `configJson`) SELECT `apiCompositionId`, `resourceType`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `anchorResourceType`, `maxLagDays`, `priority`, `configJson` FROM `apiCompositionMembers`;--> statement-breakpoint
DROP TABLE `apiCompositionMembers`;--> statement-breakpoint
ALTER TABLE `__new_apiCompositionMembers` RENAME TO `apiCompositionMembers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;