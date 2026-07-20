/**
 * Web Push delivery using SubtleCrypto only (no npm libraries).
 *
 * Implements:
 *   - RFC 8291: Message Encryption for Web Push (AES-128-GCM, HKDF)
 *   - RFC 8292: Voluntary Application Server Identification (VAPID / ES256)
 *
 * Adapted from tojemoc/vmp packages/api/src/webpush.ts.
 *
 * Required env:
 *   VAPID_PRIVATE_KEY — base64url raw 32-byte EC P-256 private key (secret)
 *   VAPID_PUBLIC_KEY  — base64url uncompressed 65-byte EC P-256 public key (var)
 *   EMAIL_FROM        — used as VAPID subject (mailto:)
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  tag?:  string;
}

export interface PushEnv {
  VAPID_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY:  string;
  EMAIL_FROM?:       string;
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function b64urlToUint8(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/')
    + '=='.slice(0, (4 - (b64url.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function uint8ToB64url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concatBuffers(...bufs: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const total = bufs.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buf of bufs) {
    out.set(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf, offset);
    offset += buf.byteLength;
  }
  return out;
}

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return new Uint8Array(data).buffer;
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────────────────────

async function importVapidPrivateKey(b64urlPrivate: string, b64urlPublic: string): Promise<CryptoKey> {
  const rawPrivate = b64urlToUint8(b64urlPrivate);
  const rawPublic  = b64urlToUint8(b64urlPublic);

  if (rawPrivate.length !== 32) throw new Error('Invalid VAPID private key length');
  if (rawPublic.length !== 65 || rawPublic[0] !== 0x04) throw new Error('Invalid VAPID public key format');

  const x = uint8ToB64url(rawPublic.slice(1, 33));
  const y = uint8ToB64url(rawPublic.slice(33, 65));
  const d = uint8ToB64url(rawPrivate);

  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: false, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

async function signVapidJwt(
  audience: string,
  subject: string,
  vapidPrivateKeyB64: string,
  vapidPublicKeyB64: string,
  expiresIn = 43_200,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: now + expiresIn, sub: subject };

  const enc = new TextEncoder();
  const headerB64  = uint8ToB64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ToB64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importVapidPrivateKey(vapidPrivateKeyB64, vapidPublicKeyB64);
  const sigDer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput),
  );

  const sig = ecdsaSignatureToJose(new Uint8Array(sigDer));
  return `${signingInput}.${uint8ToB64url(sig)}`;
}

function parseDerLength(bytes: Uint8Array, offset: number): { length: number; nextOffset: number } {
  if (offset >= bytes.length) throw new Error('Invalid DER length');
  const first = bytes[offset];
  if (first === undefined) throw new Error('Invalid DER length');
  if (first < 0x80) return { length: first, nextOffset: offset + 1 };
  const octets = first & 0x7f;
  if (octets < 1 || octets > 2 || offset + 1 + octets > bytes.length) {
    throw new Error('Invalid DER length');
  }
  let length = 0;
  for (let i = 0; i < octets; i++) {
    const byte = bytes[offset + 1 + i];
    if (byte === undefined) throw new Error('Invalid DER length');
    length = (length << 8) | byte;
  }
  return { length, nextOffset: offset + 1 + octets };
}

function parseDerInteger(bytes: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } {
  if (bytes[offset] !== 0x02) throw new Error('Invalid DER integer tag');
  const { length, nextOffset } = parseDerLength(bytes, offset + 1);
  const end = nextOffset + length;
  if (end > bytes.length) throw new Error('Invalid DER integer length');
  return { value: bytes.slice(nextOffset, end), nextOffset: end };
}

function ecdsaSignatureToJose(signature: Uint8Array): Uint8Array {
  if (signature.length === 64) return signature;
  if (signature.length < 8 || signature[0] !== 0x30) {
    throw new Error('Unsupported ECDSA signature format');
  }

  const seq = parseDerLength(signature, 1);
  let offset = seq.nextOffset;
  if (offset + seq.length !== signature.length) throw new Error('Invalid DER sequence length');

  const rParsed = parseDerInteger(signature, offset);
  const sParsed = parseDerInteger(signature, rParsed.nextOffset);
  if (sParsed.nextOffset !== signature.length) throw new Error('Trailing bytes in DER signature');

  let r = rParsed.value;
  let s = sParsed.value;
  if (r.length > 32) {
    if (r.length === 33 && r[0] === 0x00) r = r.slice(1);
    else throw new Error('Invalid DER integer length');
  }
  if (s.length > 32) {
    if (s.length === 33 && s[0] === 0x00) s = s.slice(1);
    else throw new Error('Invalid DER integer length');
  }

  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

// ── RFC 8291 encryption ───────────────────────────────────────────────────────

async function encryptPayload(plaintext: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const subscriberPublicKeyBytes = b64urlToUint8(p256dhB64);
  const subscriberPublicKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(subscriberPublicKeyBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  const ephemeralKeyPair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;

  const exportedPub = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
  const ephemeralPublicKeyRaw = new Uint8Array(exportedPub as ArrayBuffer);

  // Workers TS types spell the peer key as `$public`; the runtime Web Crypto
  // API still expects the standard `public` field (same as vmp's webpush.ts).
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPublicKey } as SubtleCryptoDeriveKeyAlgorithm,
    ephemeralKeyPair.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = b64urlToUint8(authB64);
  const enc = new TextEncoder();

  const prkKey = await hkdfExtract(authSecret, sharedSecret);
  const prkInfo = concatBuffers(
    enc.encode('WebPush: info\x00'),
    subscriberPublicKeyBytes,
    ephemeralPublicKeyRaw,
  );
  const ikm = await hkdfExpand(prkKey, prkInfo, 32);
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12);

  const plaintextBytes = enc.encode(plaintext);
  const paddedPlaintext = concatBuffers(plaintextBytes, new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey('raw', toArrayBuffer(cek), { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(nonce) }, cekKey, toArrayBuffer(paddedPlaintext)),
  );

  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false);

  const header = concatBuffers(
    salt,
    rsBytes,
    new Uint8Array([ephemeralPublicKeyRaw.length]),
    ephemeralPublicKeyRaw,
  );

  return concatBuffers(header, ciphertext);
}

async function hkdfExtract(salt: Uint8Array | ArrayBuffer, ikm: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', toArrayBuffer(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(ikm)));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  if (length > 32) throw new RangeError('hkdfExpand: length must be ≤ 32');
  const key = await crypto.subtle.importKey(
    'raw', toArrayBuffer(prk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const t1 = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, toArrayBuffer(concatBuffers(info, new Uint8Array([0x01])))),
  );
  return t1.slice(0, length);
}

// ── Send ──────────────────────────────────────────────────────────────────────

export type PushSendErrorCode = 'vapid_not_configured' | 'subscription_gone' | 'push_failed';

export class PushSendError extends Error {
  code: PushSendErrorCode;
  status?: number;

  constructor(message: string, code: PushSendErrorCode, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Send a single Web Push notification.
 * Throws PushSendError with code `subscription_gone` on 404/410 so callers can prune KV.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: PushPayload,
  env: PushEnv,
): Promise<{ ok: true; status: number }> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    throw new PushSendError('VAPID keys not configured', 'vapid_not_configured');
  }

  const { endpoint, p256dh, auth } = subscription;
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const subject = `mailto:${env.EMAIL_FROM || 'noreply@example.com'}`;

  const vapidJwt = await signVapidJwt(audience, subject, env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const vapidAuthHeader = `vapid t=${vapidJwt},k=${env.VAPID_PUBLIC_KEY}`;
  const webPushAuthHeader = `WebPush ${vapidJwt}`;

  const encrypted = await encryptPayload(JSON.stringify(payload), p256dh, auth);

  const send = (authorizationValue: string) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10_000);
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':     'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization':    authorizationValue,
        'Crypto-Key':       `p256ecdsa=${env.VAPID_PUBLIC_KEY}`,
        'TTL':              '86400',
      },
      body: toArrayBuffer(encrypted),
      signal: abort.signal,
    }).finally(() => clearTimeout(timer));
  };

  let response: Response;
  try {
    response = await send(vapidAuthHeader);
    if (!response.ok && (response.status === 400 || response.status === 401 || response.status === 403)) {
      response = await send(webPushAuthHeader);
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    throw new PushSendError(
      `Push fetch error: ${e.name === 'AbortError' ? 'timeout' : e.message}`,
      'push_failed',
    );
  }

  if (!response.ok) {
    if (response.status === 410 || response.status === 404) {
      throw new PushSendError('Push subscription expired', 'subscription_gone', response.status);
    }
    throw new PushSendError(`Push delivery failed: ${response.status}`, 'push_failed', response.status);
  }

  return { ok: true, status: response.status };
}
