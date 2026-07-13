CREATE TABLE `api_key_usage` (
	`api_key_id` text NOT NULL,
	`window` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`soft_limit_notified_at` integer,
	CONSTRAINT `api_key_usage_pk` PRIMARY KEY(`api_key_id`, `window`, `window_started_at`),
	CONSTRAINT `fk_api_key_usage_api_key_id_api_key_id_fk` FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON DELETE CASCADE
);
