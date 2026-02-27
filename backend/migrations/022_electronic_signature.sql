-- Migration 022: Electronic Signature System
-- Adds signature/stamp support for users, signature audit trail, and document verification

-- 1. Add signature columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stamp_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- 2. Create signature audit log table
CREATE TABLE IF NOT EXISTS signature_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  document_type VARCHAR(50) NOT NULL, -- 'decompt', 'metre', 'revision', 'pv'
  document_id UUID,
  project_id UUID REFERENCES projects(id),
  document_hash VARCHAR(128), -- SHA-256 hash of document at signing time
  verification_code VARCHAR(20) NOT NULL, -- unique short code for QR verification
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sig_audit_user ON signature_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sig_audit_verification ON signature_audit_log(verification_code);
CREATE INDEX IF NOT EXISTS idx_sig_audit_document ON signature_audit_log(document_type, document_id);
