-- Create generation_jobs table for async processing
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  prompt TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}', -- Stores chat history, project info, etc.
  result JSONB, -- Stores generation result when completed
  error TEXT, -- Stores error message if failed
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '24 hours',

  -- Indexes for performance
  CONSTRAINT generation_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Add indexes for better query performance
CREATE INDEX idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_project_id ON generation_jobs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_generation_jobs_created_at ON generation_jobs(created_at);
CREATE INDEX idx_generation_jobs_expires_at ON generation_jobs(expires_at);

-- Add composite index for polling queries
CREATE INDEX idx_generation_jobs_status_created ON generation_jobs(status, created_at);
