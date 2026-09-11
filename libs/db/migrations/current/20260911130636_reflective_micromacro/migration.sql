CREATE TABLE `placeSearchScopes` (
	`scopeId` text PRIMARY KEY,
	`snapshotId` text NOT NULL
);
--> statement-breakpoint
DROP TABLE `placesFts`;