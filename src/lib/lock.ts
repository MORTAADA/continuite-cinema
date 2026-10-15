import { getSetting, setSetting, getDatabase } from './db';

const PIN_LENGTH = 6;
/** Itérations PBKDF2 : assez lent pour freiner une attaque par force brute, assez rapide pour un téléphone. */
const PBKDF2_ITERATIONS = 150_000;
const MAX_FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 caractères, sans 0/O/1/I

/** Réglages de sécurité : jamais inclus dans une sauvegarde, jamais écrasés par une restauration. */
export const SECURITY_SETTING_KEYS: ReadonlySet<string> = new Set([
  'profileEmail', 'pinSalt', 'pinHash', 'pinKdf', 'setupComplete',
  'pinFailures', 'pinLockedUntil', 'recoverySalt', 'recoveryHash', 'recoveryFailures', 'recoveryLockedUntil',
]);

export type UnlockResult = { ok: true } | { ok: false; retryAfterMs: number; attemptsLeft: number };

const encoder = new TextEncoder();
const pinPattern = new RegExp(`^\\d{${PIN_LENGTH}}$`);

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function createSalt() { return toHex(crypto.getRandomValues(new Uint8Array(16))); }
function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function pbkdf2(secret: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}
async function sha256(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

function assertProfileInput(email: string, pin: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Saisissez une adresse e-mail valide.');
  if (!pinPattern.test(pin)) throw new Error('Le code local doit contenir exactement 6 chiffres.');
  return normalizedEmail;
}

/* ---------- Limitation des tentatives (persistée : redémarrer l'app ne la contourne pas) ---------- */
type Bucket = 'pin' | 'recovery';
const failuresKey = (b: Bucket) => `${b}Failures`;
const lockedKey = (b: Bucket) => `${b}LockedUntil`;

async function lockRemaining(bucket: Bucket) {
  const until = (await getSetting<number>(lockedKey(bucket))) ?? 0;
  return Math.max(0, until - Date.now());
}
async function registerFailure(bucket: Bucket): Promise<{ retryAfterMs: number; attemptsLeft: number }> {
  const failures = ((await getSetting<number>(failuresKey(bucket))) ?? 0) + 1;
  await setSetting(failuresKey(bucket), failures);
  if (failures % MAX_FREE_ATTEMPTS !== 0) return { retryAfterMs: 0, attemptsLeft: MAX_FREE_ATTEMPTS - (failures % MAX_FREE_ATTEMPTS) };
  const step = Math.floor(failures / MAX_FREE_ATTEMPTS) - 1;
  const delay = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** step);
  await setSetting(lockedKey(bucket), Date.now() + delay);
  return { retryAfterMs: delay, attemptsLeft: MAX_FREE_ATTEMPTS };
}
async function clearFailures(bucket: Bucket) {
  await setSetting(failuresKey(bucket), 0);
  await setSetting(lockedKey(bucket), 0);
}

/* ---------- Profil ---------- */
export async function hasLocalProfile() {
  return Boolean(await getSetting<string>('profileEmail')) && Boolean(await getSetting<string>('pinHash'));
}
export async function getProfileEmail() {
  return (await getSetting<string>('profileEmail')) ?? '';
}
export async function hasRecoveryCode() {
  return Boolean(await getSetting<string>('recoveryHash'));
}

async function storePin(pin: string) {
  const salt = createSalt();
  await setSetting('pinSalt', salt);
  await setSetting('pinHash', await pbkdf2(pin, salt, PBKDF2_ITERATIONS));
  await setSetting('pinKdf', PBKDF2_ITERATIONS);
}

export function formatRecoveryCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}
function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return formatRecoveryCode(Array.from(bytes, (b) => RECOVERY_ALPHABET[b % 32]).join(''));
}
async function storeRecoveryCode(code: string) {
  const salt = createSalt();
  await setSetting('recoverySalt', salt);
  await setSetting('recoveryHash', await pbkdf2(code.replace(/-/g, ''), salt, PBKDF2_ITERATIONS));
}

/** Crée (ou remplace) le code de récupération. À afficher une seule fois à la personne. */
export async function createRecoveryCode(): Promise<string> {
  const code = generateRecoveryCode();
  await storeRecoveryCode(code);
  return code;
}

/** Crée le profil local et retourne le code de récupération à montrer une seule fois. */
export async function createLocalProfile(email: string, pin: string): Promise<string> {
  const normalizedEmail = assertProfileInput(email, pin);
  await storePin(pin);
  await setSetting('profileEmail', normalizedEmail);
  await clearFailures('pin');
  await clearFailures('recovery');
  const code = await createRecoveryCode();
  await setSetting('setupComplete', true);
  return code;
}

async function checkPin(pin: string): Promise<boolean> {
  const stored = await getSetting<string>('pinHash');
  if (!stored) return false;
  const salt = await getSetting<string>('pinSalt');
  const iterations = await getSetting<number>('pinKdf');
  if (salt && iterations) return sameHash(stored, await pbkdf2(pin, salt, iterations));
  // Anciens profils (SHA-256 simple) : vérification puis mise à niveau automatique vers PBKDF2.
  const legacy = salt ? await sha256(`${salt}:${pin}`) : await sha256(pin);
  if (!sameHash(stored, legacy)) return false;
  await storePin(pin);
  return true;
}

export async function verifyPin(pin: string): Promise<UnlockResult> {
  const wait = await lockRemaining('pin');
  if (wait > 0) return { ok: false, retryAfterMs: wait, attemptsLeft: 0 };
  if (!pinPattern.test(pin)) return { ok: false, retryAfterMs: 0, attemptsLeft: MAX_FREE_ATTEMPTS };
  if (await checkPin(pin)) { await clearFailures('pin'); return { ok: true }; }
  const failure = await registerFailure('pin');
  return { ok: false, ...failure };
}

export async function getPinLockRemaining() { return lockRemaining('pin'); }
export async function getRecoveryLockRemaining() { return lockRemaining('recovery'); }

/** Changement du code depuis l'application déverrouillée (l'ancien code est redemandé). */
export async function changePin(currentPin: string, newPin: string): Promise<UnlockResult> {
  if (!pinPattern.test(newPin)) throw new Error('Le nouveau code doit contenir exactement 6 chiffres.');
  const check = await verifyPin(currentPin);
  if (!check.ok) return check;
  await storePin(newPin);
  return { ok: true };
}

/** Code oublié : le code de récupération permet de définir un nouveau code. Retourne un nouveau code de récupération. */
export async function resetPinWithRecovery(code: string, newPin: string): Promise<{ ok: true; newRecoveryCode: string } | { ok: false; retryAfterMs: number; attemptsLeft: number }> {
  if (!pinPattern.test(newPin)) throw new Error('Le nouveau code doit contenir exactement 6 chiffres.');
  const wait = await lockRemaining('recovery');
  if (wait > 0) return { ok: false, retryAfterMs: wait, attemptsLeft: 0 };
  const stored = await getSetting<string>('recoveryHash');
  const salt = await getSetting<string>('recoverySalt');
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!stored || !salt || normalized.length !== 16 || !sameHash(stored, await pbkdf2(normalized, salt, PBKDF2_ITERATIONS))) {
    return { ok: false, ...(await registerFailure('recovery')) };
  }
  await storePin(newPin);
  await clearFailures('pin');
  await clearFailures('recovery');
  return { ok: true, newRecoveryCode: await createRecoveryCode() };
}

/** Vérifie que la base locale est lisible (pour ne jamais déverrouiller par défaut en cas d'erreur). */
export async function assertDatabaseReadable() { await getDatabase(); }
