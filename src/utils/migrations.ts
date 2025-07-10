import sql from './db';
import logger from './logger';

export async function createTables() {
  try {
    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        description TEXT,
        interests JSONB,
        avatar VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        is_public BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Networks table
    await sql`
      CREATE TABLE IF NOT EXISTS networks (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        tag_name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        is_private BOOLEAN DEFAULT FALSE,
        passcode VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Network members and their roles
    await sql`
      CREATE TABLE IF NOT EXISTS network_members (
        id UUID PRIMARY KEY,
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
        id UUID PRIMARY KEY,
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
        id UUID PRIMARY KEY,
        user_id_1 UUID REFERENCES users(id) ON DELETE CASCADE,
        user_id_2 UUID REFERENCES users(id) ON DELETE CASCADE,
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id_1, user_id_2)
      )
    `;

    // Network posts
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY,
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
        id UUID PRIMARY KEY,
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
        id UUID PRIMARY KEY,
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
        id UUID PRIMARY KEY,
        blocker_id UUID REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blocker_id, blocked_id)
      )
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