-- Migration 004: Google OAuth Support
-- Add Google OAuth support to users table and create temp tables for Google user registration state

-- Update users table to support Google OAuth
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS is_google_user BOOLEAN DEFAULT FALSE,
ALTER COLUMN password DROP NOT NULL;

-- Create index on google_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Create temporary table for Google users during registration process
CREATE TABLE IF NOT EXISTS google_users_temp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    profile_pic TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Create index on google_id for temp table
CREATE INDEX IF NOT EXISTS idx_google_users_temp_google_id ON google_users_temp(google_id);
CREATE INDEX IF NOT EXISTS idx_google_users_temp_email ON google_users_temp(email);

-- Create table to track Google user registration state
CREATE TABLE IF NOT EXISTS google_user_registration_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Can reference either google_users_temp.id or users.id
    step_completed JSONB DEFAULT '{}', -- JSON object tracking completed steps
    is_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Create index on user_id for registration state
CREATE INDEX IF NOT EXISTS idx_google_registration_state_user_id ON google_user_registration_state(user_id);
CREATE INDEX IF NOT EXISTS idx_google_registration_state_complete ON google_user_registration_state(is_complete);

-- Create table to store temporary registration data for Google users
CREATE TABLE IF NOT EXISTS google_user_registration_temp_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES google_users_temp(id) ON DELETE CASCADE,
    bio TEXT,
    interests TEXT, -- JSON array as string
    location TEXT,
    phone TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    connection_request_privacy VARCHAR(20) DEFAULT 'network_only',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Create index on user_id for temp data
CREATE INDEX IF NOT EXISTS idx_google_temp_data_user_id ON google_user_registration_temp_data(user_id);

-- Create function to clean up completed Google registrations
CREATE OR REPLACE FUNCTION cleanup_completed_google_registration(temp_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Delete from temp data table
    DELETE FROM google_user_registration_temp_data WHERE user_id = temp_user_id;
    
    -- Delete from registration state table
    DELETE FROM google_user_registration_state WHERE user_id = temp_user_id;
    
    -- Delete from temp users table
    DELETE FROM google_users_temp WHERE id = temp_user_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to merge Google user data into main users table
CREATE OR REPLACE FUNCTION merge_google_user_to_main(
    temp_user_id UUID,
    final_name TEXT,
    final_description TEXT DEFAULT NULL,
    final_interests TEXT DEFAULT NULL,
    final_is_public BOOLEAN DEFAULT FALSE,
    final_connection_privacy VARCHAR(20) DEFAULT 'network_only'
)
RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
    temp_user_record RECORD;
BEGIN
    -- Get temp user data
    SELECT * INTO temp_user_record FROM google_users_temp WHERE id = temp_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Temp user not found with id: %', temp_user_id;
    END IF;
    
    -- Insert into main users table
    INSERT INTO users (
        name, email, google_id, is_google_user, avatar,
        description, interests, isVerified, isPublic, 
        connection_request_privacy, createdAt, updatedAt
    ) VALUES (
        final_name, temp_user_record.email, temp_user_record.google_id, 
        TRUE, temp_user_record.profile_pic, final_description, 
        final_interests, TRUE, -- Google users are auto-verified
        final_is_public, final_connection_privacy, 
        temp_user_record.created_at, now()
    ) RETURNING id INTO new_user_id;
    
    -- Clean up temp data
    PERFORM cleanup_completed_google_registration(temp_user_id);
    
    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;