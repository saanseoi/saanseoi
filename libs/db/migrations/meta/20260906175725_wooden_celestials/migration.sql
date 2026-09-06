CREATE TABLE `api_key_usage_rollup` (
	`id` text PRIMARY KEY,
	`datasets` text NOT NULL,
	`revision` text NOT NULL,
	`completed_through` integer NOT NULL
);
