-- Add user_id to all tables that need it
ALTER TABLE metres ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE periodes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE decompts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Add missing columns to metres
ALTER TABLE metres ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE metres ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
ALTER TABLE metres ADD COLUMN IF NOT EXISTS mesures JSONB DEFAULT '[]';
ALTER TABLE metres ADD COLUMN IF NOT EXISTS total_quantite DECIMAL(15, 4) DEFAULT 0;

-- Add missing columns to bordereaux  
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS unite VARCHAR(50);
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS quantite DECIMAL(15, 4) DEFAULT 0;
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS montant_total DECIMAL(15, 2) DEFAULT 0;

-- Add missing columns to periodes
ALTER TABLE periodes ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE periodes ADD COLUMN IF NOT EXISTS description TEXT;

-- Create indexes for user_id columns
CREATE INDEX IF NOT EXISTS idx_metres_user_id ON metres(user_id);
CREATE INDEX IF NOT EXISTS idx_bordereaux_user_id ON bordereaux(user_id);
CREATE INDEX IF NOT EXISTS idx_periodes_user_id ON periodes(user_id);
CREATE INDEX IF NOT EXISTS idx_decompts_user_id ON decompts(user_id);
