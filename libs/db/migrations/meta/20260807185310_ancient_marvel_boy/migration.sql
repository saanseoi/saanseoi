CREATE TABLE `facebookDeletionRequest` (
	`confirmationCodeHash` text PRIMARY KEY,
	`completedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
