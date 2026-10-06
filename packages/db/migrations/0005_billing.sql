CREATE TYPE "public"."invoice_status" AS ENUM('due', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."plan_request_status" AS ENUM('pending', 'approved', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" text NOT NULL,
	"plan" "plan" NOT NULL,
	"locations" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"status" "invoice_status" DEFAULT 'due' NOT NULL,
	"method" text,
	"paid_at" timestamp with time zone,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"locations" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text NOT NULL,
	"status" "plan_request_status" DEFAULT 'pending' NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"note" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"plan" "plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_ref" text,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_request_id_plan_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."plan_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_requests" ADD CONSTRAINT "plan_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_requests_reference_key" ON "plan_requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "plan_requests_org_idx" ON "plan_requests" USING btree ("organization_id","status");