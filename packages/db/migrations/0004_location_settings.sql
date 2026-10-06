ALTER TABLE "brands" ADD COLUMN "logo_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "address_en" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "address_ar" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "building" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "delivery_radius_m" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "show_map" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "hours" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "closures" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "phone_is_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "order_url" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "reservation_url" text;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_photo_id_media_id_fk" FOREIGN KEY ("logo_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;