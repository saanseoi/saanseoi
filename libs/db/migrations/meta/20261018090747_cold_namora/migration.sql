CREATE TABLE `basemapReleaseStats` (
	`id` text PRIMARY KEY,
	`region` text NOT NULL,
	`version` text NOT NULL,
	`archiveSha256` text NOT NULL,
	`statistics` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
