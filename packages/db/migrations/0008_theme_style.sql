ALTER TABLE "custom_themes" ADD COLUMN "corners" text DEFAULT 'soft' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "header" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "layout" text DEFAULT 'list' NOT NULL;