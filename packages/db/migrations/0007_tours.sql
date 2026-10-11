CREATE TABLE "tour_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"name_en" text,
	"name_ar" text,
	"position" integer NOT NULL,
	"seconds" integer DEFAULT 10 NOT NULL,
	"quality" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour_spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"kind" text NOT NULL,
	"label_en" text,
	"label_ar" text,
	"note_en" text,
	"note_ar" text,
	"item_id" uuid,
	"target_scene_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"published" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_scenes" ADD CONSTRAINT "tour_scenes_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_spots" ADD CONSTRAINT "tour_spots_scene_id_tour_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_spots" ADD CONSTRAINT "tour_spots_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_spots" ADD CONSTRAINT "tour_spots_target_scene_id_tour_scenes_id_fk" FOREIGN KEY ("target_scene_id") REFERENCES "public"."tour_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tour_scenes_location_idx" ON "tour_scenes" USING btree ("location_id","position");--> statement-breakpoint
CREATE INDEX "tour_spots_scene_idx" ON "tour_spots" USING btree ("scene_id");