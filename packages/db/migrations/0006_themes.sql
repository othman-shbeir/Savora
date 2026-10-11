CREATE TABLE "custom_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"colors" jsonb NOT NULL,
	"font" text DEFAULT 'sans' NOT NULL,
	"bold_prices" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "theme_ref" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD CONSTRAINT "custom_themes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD CONSTRAINT "custom_themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_themes_org_idx" ON "custom_themes" USING btree ("organization_id");