PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionAreaPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_divisionAreaPublicationState`(`snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt` FROM `divisionAreaPublicationState`;--> statement-breakpoint
DROP TABLE `divisionAreaPublicationState`;--> statement-breakpoint
ALTER TABLE `__new_divisionAreaPublicationState` RENAME TO `divisionAreaPublicationState`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionBoundaryPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_divisionBoundaryPublicationState`(`snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt` FROM `divisionBoundaryPublicationState`;--> statement-breakpoint
DROP TABLE `divisionBoundaryPublicationState`;--> statement-breakpoint
ALTER TABLE `__new_divisionBoundaryPublicationState` RENAME TO `divisionBoundaryPublicationState`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_divisionPublicationState`(`snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt` FROM `divisionPublicationState`;--> statement-breakpoint
DROP TABLE `divisionPublicationState`;--> statement-breakpoint
ALTER TABLE `__new_divisionPublicationState` RENAME TO `divisionPublicationState`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placePublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_placePublicationState`(`snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt` FROM `placePublicationState`;--> statement-breakpoint
DROP TABLE `placePublicationState`;--> statement-breakpoint
ALTER TABLE `__new_placePublicationState` RENAME TO `placePublicationState`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetPublicationState` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'publishing' NOT NULL,
	`publicationToken` text DEFAULT '' NOT NULL,
	`preparedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_streetPublicationState`(`snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `scopeId`, `status`, `publicationToken`, `preparedAt`, `createdAt`, `updatedAt` FROM `streetPublicationState`;--> statement-breakpoint
DROP TABLE `streetPublicationState`;--> statement-breakpoint
ALTER TABLE `__new_streetPublicationState` RENAME TO `streetPublicationState`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionAreaPublicationState_scope_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionBoundaryPublicationState_scope_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionPublicationState_scope_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `placePublicationState_scope_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streetPublicationState_scope_idx`;