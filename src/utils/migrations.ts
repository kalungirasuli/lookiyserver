import sql from './db';
import logger from './logger';

export async function createTables() {
  try {
    // Enable UUID extension
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        description TEXT,
        interests TEXT,
        avatar TEXT,
        isVerified BOOLEAN DEFAULT FALSE,
        isPublic BOOLEAN DEFAULT FALSE,
        connection_request_privacy VARCHAR(20) DEFAULT 'network_only',
        createdAt TIMESTAMP DEFAULT now(),
        updatedAt TIMESTAMP DEFAULT now()
      )
    `;

    // Add connection_request_privacy column if it doesn't exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS connection_request_privacy VARCHAR(20) DEFAULT 'network_only'
    `;

    // Networks table
    await sql`
      CREATE TABLE IF NOT EXISTS networks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        tag_name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        is_private BOOLEAN DEFAULT FALSE,
        passcode VARCHAR(255),
        avatar TEXT,
        approval_mode VARCHAR(50) NOT NULL DEFAULT 'manual',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_passcode_update TIMESTAMP WITH TIME ZONE,
        suspension_status VARCHAR(20) DEFAULT 'active',
        suspended_at TIMESTAMP WITH TIME ZONE,
        suspended_by UUID REFERENCES users(id),
        suspension_token UUID,
        suspension_expires_at TIMESTAMP WITH TIME ZONE
      )
    `;

    // Network members and their roles
    await sql`
      CREATE TABLE IF NOT EXISTS network_members (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(network_id, user_id)
      )
    `;

    // Connection requests
    await sql`
      CREATE TABLE IF NOT EXISTS connection_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        responded_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_user_id, to_user_id, network_id)
      )
    `;

    // Connections (accepted connections)
    await sql`
      CREATE TABLE IF NOT EXISTS connections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id_1 UUID REFERENCES users(id) ON DELETE CASCADE,
        user_id_2 UUID REFERENCES users(id) ON DELETE CASCADE,
        network_id UUID REFERENCES networks(id) ON DELETE SET NULL,
        saved BOOLEAN DEFAULT FALSE,
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id_1, user_id_2, network_id)
      )
    `;

    // Network posts
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        tags JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Post comments
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Private messages
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Connection blocking
    await sql`
      CREATE TABLE IF NOT EXISTS blocked_connections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        blocker_id UUID REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blocker_id, blocked_id)
      )
    `;

    // User sessions table for tracking login instances
    await sql`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        device_info JSONB,
        ip_address TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE(user_id, device_id)
      )
    `;

    // Login attempts tracking
    await sql`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address TEXT NOT NULL,
        attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_successful BOOLEAN DEFAULT FALSE
      )
    `;

    // Account suspensions
    await sql`
      CREATE TABLE IF NOT EXISTS account_suspensions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        suspended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `;
    // Password reset tokens
    await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id),
      token UUID NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;
    await sql`
     CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
     `;
     await sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    `;

    // Modify users table to add deletion status
    await sql`
      ALTER TABLE IF EXISTS users 
      ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active'
    `;

    // Deleted accounts tracking
    await sql`
      CREATE TABLE IF NOT EXISTS deleted_accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        deletion_requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
        permanent_deletion_date TIMESTAMP WITH TIME ZONE NOT NULL,
        recovery_token UUID,
        reason TEXT,
        is_permanent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_deleted_accounts_user_id ON deleted_accounts(user_id)
      `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_deleted_accounts_recovery_token ON deleted_accounts(recovery_token);
    `;

    // Pending network join requests
    await sql`
      CREATE TABLE IF NOT EXISTS pending_network_joins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        passcode_attempt TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(network_id, user_id)
      )
    `;

    // Network invitations
    await sql`
      CREATE TABLE IF NOT EXISTS network_invitations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        invited_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        invited_by_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        invite_token UUID NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(network_id, invited_user_id, invite_token)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_network_invitations_token ON network_invitations(invite_token)
    `;

    // Network goals
    await sql`
      CREATE TABLE IF NOT EXISTS network_goals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_by_id UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // User selected goals in network
    await sql`
      CREATE TABLE IF NOT EXISTS user_network_goals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        goal_id UUID REFERENCES network_goals(id) ON DELETE CASCADE,
        selected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, network_id, goal_id)
      )
    `;

    // User recommendations table
    await sql`
      CREATE TABLE IF NOT EXISTS user_recommendations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        recommended_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        network_id UUID REFERENCES networks(id) ON DELETE CASCADE,
        match_score DECIMAL(5,4) NOT NULL,
        is_served BOOLEAN DEFAULT FALSE,
        served_at TIMESTAMP WITH TIME ZONE,
        is_acted_upon BOOLEAN DEFAULT FALSE,
        acted_upon_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, recommended_user_id, network_id)
      )
    `;

    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_network 
      ON user_recommendations(user_id, network_id, is_served)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_recommendations_score 
      ON user_recommendations(network_id, match_score DESC)
    `;

    // Run Google OAuth migration
    logger.info('Running Google OAuth migration...');
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '../migrations/004_google_oauth_support.sql');
    
    try {
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      await sql.unsafe(migrationSQL);
      logger.info('Google OAuth migration completed successfully');
    } catch (migrationError) {
      logger.error('Error running Google OAuth migration', {
        error: migrationError instanceof Error ? migrationError.message : 'Unknown error'
      });
      // Don't throw here to allow other migrations to continue
    }

    // Run login method migration
    logger.info('Running login method migration...');
    const loginMethodMigrationPath = path.join(__dirname, '../migrations/005_add_login_method_column.sql');
    
    try {
      const loginMethodMigrationSQL = fs.readFileSync(loginMethodMigrationPath, 'utf8');
      await sql.unsafe(loginMethodMigrationSQL);
      logger.info('Login method migration completed successfully');
    } catch (migrationError) {
      logger.error('Error running login method migration', {
        error: migrationError instanceof Error ? migrationError.message : 'Unknown error'
      });
      // Don't throw here to allow other migrations to continue
    }

    logger.info('All database tables created successfully');
  } catch (error) {
    logger.error('Error creating database tables', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// Function to run migrations
export async function runMigrations() {
  logger.info('Starting database migrations');
  await createTables();
  logger.info('Database migrations completed');
}