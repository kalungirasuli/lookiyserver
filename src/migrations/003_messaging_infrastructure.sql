-- Create table for tracking Kafka topic configurations
CREATE TABLE IF NOT EXISTS kafka_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    retention_hours INT DEFAULT 168, -- 1 week
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for tracking Redis cache keys
CREATE TABLE IF NOT EXISTS cache_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_pattern VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    ttl_seconds INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default Kafka topics
INSERT INTO kafka_topics (topic_name, description, retention_hours) VALUES
    ('network-updates', 'Network-related events and updates', 168),
    ('user-activity', 'User activity events and status changes', 168),
    ('join-requests', 'Network join request events', 168),
    ('notifications', 'User notifications and alerts', 168)
ON CONFLICT (topic_name) DO NOTHING;

-- Insert default Redis cache key patterns
INSERT INTO cache_keys (key_pattern, description, ttl_seconds) VALUES
    ('user:*', 'User data and profiles', 3600),
    ('user:*:profile', 'User profile data', 3600),
    ('network:*', 'Network data', 3600),
    ('network:*:members', 'Network member lists', 300),
    ('suspension:*', 'User suspension status', 86400)
ON CONFLICT (key_pattern) DO NOTHING;

-- Create table for tracking real-time events
CREATE TABLE IF NOT EXISTS realtime_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    network_id UUID REFERENCES networks(id),
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for querying recent events
CREATE INDEX IF NOT EXISTS idx_realtime_events_created_at 
ON realtime_events(created_at DESC);

-- Create index for user events
CREATE INDEX IF NOT EXISTS idx_realtime_events_user 
ON realtime_events(user_id, created_at DESC);

-- Create index for network events
CREATE INDEX IF NOT EXISTS idx_realtime_events_network 
ON realtime_events(network_id, created_at DESC);

-- Update user_sessions table to track socket connections
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS socket_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS socket_connected_at TIMESTAMP WITH TIME ZONE;