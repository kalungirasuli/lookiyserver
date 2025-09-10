import { execSync } from 'child_process';
import { writeFileSync, unlinkSync,readFileSync} from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
export function decryptServiceAccountKeyInMemory(encryptedPath: string): object | null {
  const password = process.env.KEY_PASSWORD;
  
  if (!password) {
    console.warn('Missing KEY_PASSWORD environment variable - Google Cloud Storage will be disabled');
    return null;
  }

  const tempPath = path.join(__dirname, 'temp-decrypted.json');
  
  try {
    // Use OpenSSL directly via child_process
    const command = `openssl aes-256-cbc -d -salt -in "${encryptedPath}" -out "${tempPath}" -pass pass:"${password}"`;
    execSync(command, { stdio: 'pipe' });
    
    const decrypted = readFileSync(tempPath, 'utf-8');
    const parsed = JSON.parse(decrypted);
    
    // Clean up temp file
    unlinkSync(tempPath);
    
    return parsed;
  } catch (error) {
    // Clean up temp file if it exists
    try { unlinkSync(tempPath); } catch {}
    console.warn('OpenSSL not available or decryption failed - Google Cloud Storage will be disabled:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}