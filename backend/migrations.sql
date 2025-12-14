-- Add missing columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS snss VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cbn VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rcn VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delais_entree_service DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS arrets JSONB DEFAULT NULL;

-- Add missing column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP;

-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  file_name VARCHAR(255),
  file_path TEXT,
  file_size INTEGER,
  mime_type VARCHAR(100),
  description TEXT,
  tags JSONB DEFAULT '[]',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create pvs table
CREATE TABLE IF NOT EXISTS pvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  type VARCHAR(100),
  numero VARCHAR(50),
  date DATE,
  objet TEXT,
  contenu TEXT,
  participants JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_photos_project_id ON photos(project_id);
CREATE INDEX IF NOT EXISTS idx_pvs_project_id ON pvs(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON attachments(project_id);
