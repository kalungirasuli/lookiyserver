-- Add login_method column to login_attempts table
ALTER TABLE login_attempts 
ADD COLUMN login_method VARCHAR(50) DEFAULT 'email_password';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_login_attempts_method 
ON login_attempts(login_method);

-- Update existing records to have the default login method
UPDATE login_attempts 
SET login_method = 'email_password' 
WHERE login_method IS NULL;