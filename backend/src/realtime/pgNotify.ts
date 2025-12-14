/**
 * PostgreSQL LISTEN/NOTIFY Setup for Real-time Sync
 * 
 * This module creates the necessary triggers and functions
 * for broadcasting changes via NOTIFY when operations are inserted
 */

import { getPool } from '../config/postgres';
import logger from '../utils/logger';

/**
 * Setup PostgreSQL triggers for real-time notifications
 */
export const setupRealtimeTriggers = async (): Promise<void> => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log('🔧 Setting up PostgreSQL realtime triggers...');

    // Create ops table if not exists (with all required columns)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ops (
        server_seq BIGSERIAL PRIMARY KEY,
        op_id UUID NOT NULL UNIQUE,
        client_id VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL,
        ts TIMESTAMP NOT NULL DEFAULT NOW(),
        entity VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        op_type VARCHAR(50) NOT NULL,
        payload JSONB,
        applied BOOLEAN DEFAULT TRUE,
        applied_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Indexes for ops table
      CREATE INDEX IF NOT EXISTS idx_ops_user_id ON ops(user_id);
      CREATE INDEX IF NOT EXISTS idx_ops_entity ON ops(entity);
      CREATE INDEX IF NOT EXISTS idx_ops_entity_id ON ops(entity_id);
      CREATE INDEX IF NOT EXISTS idx_ops_server_seq ON ops(server_seq);
      CREATE INDEX IF NOT EXISTS idx_ops_client_id ON ops(client_id);
      CREATE INDEX IF NOT EXISTS idx_ops_ts ON ops(ts);
      CREATE INDEX IF NOT EXISTS idx_ops_user_seq ON ops(user_id, server_seq);
    `);
    console.log('✅ ops table ready');

    // Create sync_clients table for tracking client sync state
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_clients (
        client_id VARCHAR(255) PRIMARY KEY,
        user_id UUID NOT NULL,
        last_push_at TIMESTAMP,
        last_pull_at TIMESTAMP,
        last_pushed_seq BIGINT DEFAULT 0,
        last_pulled_seq BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sync_clients_user_id ON sync_clients(user_id);
    `);
    console.log('✅ sync_clients table ready');

    // Add missing columns to existing tables for sync tracking
    await client.query(`
      DO $$ 
      BEGIN
        -- Add last_op_id and version columns to all entity tables
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS designation TEXT;
        ALTER TABLE bordereaux ADD COLUMN IF NOT EXISTS montant_total DECIMAL(15,2) DEFAULT 0;
        
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS libelle VARCHAR(255);
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS statut VARCHAR(50) DEFAULT 'en_cours';
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS is_decompte_dernier BOOLEAN DEFAULT FALSE;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS observations TEXT;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS taux_tva DECIMAL(5,2) DEFAULT 20;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS taux_retenue DECIMAL(5,2) DEFAULT 10;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS depenses_exercices_anterieurs DECIMAL(15,2) DEFAULT 0;
        ALTER TABLE periodes ADD COLUMN IF NOT EXISTS decomptes_precedents DECIMAL(15,2) DEFAULT 0;
        
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS reference VARCHAR(255);
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS designation_bordereau TEXT;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS unite VARCHAR(50);
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS lignes JSONB DEFAULT '[]';
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS total_partiel DECIMAL(15,4) DEFAULT 0;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS total_cumule DECIMAL(15,4) DEFAULT 0;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS quantite_bordereau DECIMAL(15,4) DEFAULT 0;
        ALTER TABLE metres ADD COLUMN IF NOT EXISTS pourcentage_realisation DECIMAL(5,2) DEFAULT 0;
        
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS lignes JSONB DEFAULT '[]';
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS total_ttc DECIMAL(15,2) DEFAULT 0;
        ALTER TABLE decompts ADD COLUMN IF NOT EXISTS statut VARCHAR(50) DEFAULT 'draft';
        
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS local_path TEXT;
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE photos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
        
        ALTER TABLE pvs ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE pvs ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE pvs ADD COLUMN IF NOT EXISTS user_id UUID;
        
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS user_id UUID;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS category VARCHAR(100);
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS linked_to JSONB;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS local_path TEXT;
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
        ALTER TABLE attachments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
        
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_op_id UUID;
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

        -- Add arrets column for project delays tracking
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS arrets JSONB DEFAULT '[]';
        ALTER TABLE projects ADD COLUMN IF NOT EXISTS ordre_service VARCHAR(50);
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    console.log('✅ Entity tables updated with sync columns');

    // Create the NOTIFY function
    await client.query(`
      CREATE OR REPLACE FUNCTION notify_ops_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload JSON;
      BEGIN
        -- Build the notification payload
        payload := json_build_object(
          'server_seq', NEW.server_seq,
          'op_id', NEW.op_id,
          'client_id', NEW.client_id,
          'user_id', NEW.user_id,
          'entity', NEW.entity,
          'entity_id', NEW.entity_id,
          'op_type', NEW.op_type,
          'payload', NEW.payload,
          'ts', NEW.ts
        );
        
        -- Send notification
        PERFORM pg_notify('ops_channel', payload::text);
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ notify_ops_change function created');

    // Create the trigger
    await client.query(`
      DROP TRIGGER IF EXISTS ops_notify_trigger ON ops;
      
      CREATE TRIGGER ops_notify_trigger
        AFTER INSERT ON ops
        FOR EACH ROW
        EXECUTE FUNCTION notify_ops_change();
    `);
    console.log('✅ ops_notify_trigger created');

    // Create a function to get latest server_seq for a user
    await client.query(`
      CREATE OR REPLACE FUNCTION get_latest_seq(p_user_id UUID)
      RETURNS BIGINT AS $$
      BEGIN
        RETURN COALESCE(
          (SELECT MAX(server_seq) FROM ops WHERE user_id = p_user_id AND applied = TRUE),
          0
        );
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ get_latest_seq function created');

    // Create a function to clean old ops
    await client.query(`
      CREATE OR REPLACE FUNCTION clean_old_ops(days_to_keep INTEGER DEFAULT 90)
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM ops
        WHERE ts < NOW() - (days_to_keep || ' days')::INTERVAL
        AND applied = TRUE;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ clean_old_ops function created');

    logger.info('✅ PostgreSQL realtime triggers setup complete');
    console.log('✅ PostgreSQL realtime triggers setup complete');

  } catch (error: any) {
    console.error('❌ Error setting up realtime triggers:', error.message);
    logger.error('❌ Error setting up realtime triggers:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Test the notification system
 */
export const testNotification = async (): Promise<boolean> => {
  const pool = getPool();
  
  try {
    // Insert a test operation
    const result = await pool.query(`
      INSERT INTO ops (op_id, client_id, user_id, entity, entity_id, op_type, payload)
      VALUES (
        gen_random_uuid(),
        'test-client',
        '00000000-0000-0000-0000-000000000000',
        'test',
        'test-entity',
        'TEST',
        '{"test": true}'::jsonb
      )
      RETURNING server_seq, op_id
    `);

    console.log('✅ Test notification sent:', result.rows[0]);
    
    // Clean up test
    await pool.query(`
      DELETE FROM ops WHERE entity = 'test' AND op_type = 'TEST'
    `);

    return true;
  } catch (error: any) {
    console.error('❌ Test notification failed:', error.message);
    return false;
  }
};

export default {
  setupRealtimeTriggers,
  testNotification,
};
