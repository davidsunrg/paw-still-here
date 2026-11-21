CREATE TABLE `tribute` (
  `id` text PRIMARY KEY NOT NULL,
  `pet_id` text NOT NULL REFERENCES `pet`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `kind` text NOT NULL,
  `variant` integer NOT NULL,
  `day` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `tribute_daily_unique` ON `tribute` (`pet_id`, `user_id`, `kind`, `day`);
CREATE INDEX `tribute_pet_idx` ON `tribute` (`pet_id`, `created_at`);

CREATE TABLE `letter` (
  `id` text PRIMARY KEY NOT NULL,
  `pet_id` text NOT NULL REFERENCES `pet`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  `text` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `letter_pet_idx` ON `letter` (`pet_id`, `created_at`);
