CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"visitor_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_hourly" (
	"location_id" uuid NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"scans" integer DEFAULT 0 NOT NULL,
	"qr" integer DEFAULT 0 NOT NULL,
	"ar" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scan_hourly_location_id_hour_pk" PRIMARY KEY("location_id","hour")
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "timezone" text DEFAULT 'Asia/Hebron' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_hourly" ADD CONSTRAINT "scan_hourly_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_events_dedupe_idx" ON "scan_events" USING btree ("location_id","visitor_key","occurred_at");--> statement-breakpoint
CREATE INDEX "scan_events_age_idx" ON "scan_events" USING btree ("occurred_at");