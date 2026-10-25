CREATE TABLE "tour_spaces" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"job_id" text,
	"error" text,
	"model_key" text,
	"model_bytes" integer,
	"pose" jsonb,
	"spots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"poster_id" uuid,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tour_spaces" ADD CONSTRAINT "tour_spaces_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_spaces" ADD CONSTRAINT "tour_spaces_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tour_spaces_status_idx" ON "tour_spaces" USING btree ("status");