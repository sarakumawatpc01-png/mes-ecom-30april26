import CryptoJS from 'crypto-js';

const KEY = process.env.ENCRYPTION_KEY!;

if (!KEY || KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

export function encrypt(plaintext: string): Buffer {
  const encrypted = CryptoJS.AES.encrypt(plaintext, KEY).toString();
  return Buffer.from(encrypted, 'utf8');
}

export function decrypt(cipherBuffer: Buffer): string {
  const ciphertext = cipherBuffer.toString('utf8');
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.slice(-4);
}

export function generateSecureToken(bytes = 32): string {
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}
