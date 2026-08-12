CREATE TABLE `api_key_origin_policy` (
	`api_key_id` text NOT NULL,
	`hostname` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `api_key_origin_policy_pk` PRIMARY KEY(`api_key_id`, `hostname`),
	CONSTRAINT `fk_api_key_origin_policy_api_key_id_api_key_id_fk` FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON DELETE CASCADE
);
