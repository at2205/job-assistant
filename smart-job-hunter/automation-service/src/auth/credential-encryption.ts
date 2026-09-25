// =============================================
// Credential Encryption Service
// =============================================
// AES-256-GCM encryption for platform credentials
// =============================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  // Derive a 256-bit key from the hex string
  return crypto.scryptSync(key, 'jobflow-salt', 32);
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedStr: string): string {
  const key = getEncryptionKey();
  const parts = encryptedStr.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ---- Store encrypted credential in DB ----
export async function storeCredential(
  userId: string,
  platform: string,
  username: string,
  password: string,
  query: (sql: string, params?: any[]) => Promise<any>,
): Promise<void> {
  const encryptedPassword = encrypt(password);

  await query(
    `INSERT INTO user_credentials (user_id, platform, username, encrypted_password, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, platform)
     DO UPDATE SET username = $3, encrypted_password = $4, updated_at = NOW()`,
    [userId, platform, username, encryptedPassword],
  );
}

// ---- Retrieve decrypted credential ----
export async function getCredential(
  userId: string,
  platform: string,
  queryFn: (sql: string, params?: any[]) => Promise<any>,
): Promise<{ username: string; password: string } | null> {
  const res = await queryFn(
    `SELECT username, encrypted_password FROM user_credentials
     WHERE user_id = $1 AND platform = $2`,
    [userId, platform],
  );

  if (res.rows.length === 0) return null;

  return {
    username: res.rows[0].username,
    password: decrypt(res.rows[0].encrypted_password),
  };
}
