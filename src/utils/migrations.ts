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
        createdAt TIMESTAMP DEFAULT now(),
        updatedAt TIMESTAMP DEFAULT now()
      )
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_user_id, to_user_id)
      )
    `;

    // Connections (accepted connections)
    await sql`
      CREATE TABLE IF NOT EXISTS connections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id_1 UUID REFERENCES users(id) ON DELETE CASCADE,
        user_id_2 UUID REFERENCES users(id) ON DELETE CASCADE,
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id_1, user_id_2)
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