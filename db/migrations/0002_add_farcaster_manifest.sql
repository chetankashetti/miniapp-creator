-- Add farcaster_manifest and published_at columns to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "farcaster_manifest" jsonb;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "published_at" timestamp;
