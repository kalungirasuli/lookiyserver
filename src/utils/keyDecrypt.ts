import { execSync } from 'child_process';
import { writeFileSync, unlinkSync,readFileSync} from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
export function decryptServiceAccountKeyInMemory(encryptedPath: string): object {
  const password = process.env.KEY_PASSWORD;
  
  if (!password) {
    throw new Error('Missing KEY_PASSWORD environment variable');
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
    throw error;
  }
}