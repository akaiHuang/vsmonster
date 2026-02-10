import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export type ShareTokenScope = 'task-preview';

export interface ShareTokenPayloadV1 {
  v: 1;
  scope: ShareTokenScope;
  taskId: string;
  /**
   * Expiry time in unix milliseconds. If omitted, token does not expire.
   * (Prefer short-lived tokens for end-user sharing.)
   */
  exp?: number;
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const upper = trimmed.toUpperCase();
  return upper.startsWith('YOUR_') || upper === 'CHANGEME';
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getDefaultTtlSeconds(): number {
  const raw = process.env.VSMONSTER_SHARE_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  // Default: 7 days.
  if (!Number.isFinite(parsed) || parsed <= 0) return 60 * 60 * 24 * 7;
  return parsed;
}

function shareSecretFilePath(): string {
  // Keep secrets out of git; packages/gateway/data/ is already ignored.
  // Resolve relative to this file so it works regardless of process.cwd().
  // src/services -> packages/gateway; dist/services -> packages/gateway
  const gatewayRoot = path.resolve(__dirname, '../..');
  return path.join(gatewayRoot, 'data', '.share-secret');
}

let cachedSecret: Buffer | null = null;

function getShareSecret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const fromEnv = !isPlaceholder(process.env.VSMONSTER_SHARE_SECRET)
    ? String(process.env.VSMONSTER_SHARE_SECRET).trim()
    : '';
  if (fromEnv) {
    cachedSecret = Buffer.from(fromEnv, 'utf8');
    return cachedSecret;
  }

  // Fallback: generate a local secret on first run so /share works even without env.
  const gatewayFilePath = shareSecretFilePath();
  // Legacy path: earlier development builds may have generated a secret at repoRoot/data/.share-secret.
  // Migrate it into packages/gateway/data/.share-secret so links remain stable across restarts.
  const gatewayRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(gatewayRoot, '../..');
  const legacyFilePath = path.join(repoRoot, 'data', '.share-secret');

  try {
    if (fs.existsSync(gatewayFilePath)) {
      const raw = fs.readFileSync(gatewayFilePath, 'utf8').trim();
      if (raw) {
        cachedSecret = Buffer.from(raw, 'utf8');
        return cachedSecret;
      }
    }
    if (fs.existsSync(legacyFilePath)) {
      const raw = fs.readFileSync(legacyFilePath, 'utf8').trim();
      if (raw) {
        // Best-effort migration: keep using the same secret, but store it under packages/gateway/data/.
        try {
          fs.mkdirSync(path.dirname(gatewayFilePath), { recursive: true });
          fs.writeFileSync(gatewayFilePath, `${raw}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        } catch {
          // Ignore if it already exists or write fails.
        }
        cachedSecret = Buffer.from(raw, 'utf8');
        return cachedSecret;
      }
    }
  } catch (err) {
    logger.warn(`Failed reading share secret file: ${String(err)}`);
  }

  const generated = base64UrlEncode(crypto.randomBytes(32));
  try {
    fs.mkdirSync(path.dirname(gatewayFilePath), { recursive: true });
    fs.writeFileSync(gatewayFilePath, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    logger.warn(`Failed writing share secret file: ${String(err)}`);
  }

  logger.warn('VSMONSTER_SHARE_SECRET is not set; generated a local share secret. For best compatibility, add VSMONSTER_SHARE_SECRET to your .env.');
  cachedSecret = Buffer.from(generated, 'utf8');
  return cachedSecret;
}

function sign(payloadB64: string): string {
  const h = crypto.createHmac('sha256', getShareSecret());
  h.update(payloadB64);
  return base64UrlEncode(h.digest());
}

export function issueTaskPreviewToken(taskId: string, ttlSeconds: number = getDefaultTtlSeconds()): string {
  const now = Date.now();
  const payload: ShareTokenPayloadV1 = {
    v: 1,
    scope: 'task-preview',
    taskId,
    exp: ttlSeconds > 0 ? now + ttlSeconds * 1000 : undefined,
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sigB64 = sign(payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export function verifyTaskPreviewToken(taskId: string, token: string): ShareTokenPayloadV1 | null {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSigB64 = sign(payloadB64);
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = base64UrlDecode(sigB64);
    expectedBuf = base64UrlDecode(expectedSigB64);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: ShareTokenPayloadV1;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as ShareTokenPayloadV1;
  } catch {
    return null;
  }

  if (!payload || payload.v !== 1) return null;
  if (payload.scope !== 'task-preview') return null;
  if (payload.taskId !== taskId) return null;
  if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
    if (Date.now() > payload.exp) return null;
  }

  return payload;
}
