CREATE TABLE IF NOT EXISTS "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"prompt" text NOT NULL,
	"context" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_deployments" ADD COLUMN "contract_addresses" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "farcaster_manifest" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
