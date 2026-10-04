import { getSetting, setSetting } from './db';

const PIN_LENGTH = 6;

function assertProfileInput(email: string, pin: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Saisissez une adresse e-mail valide.');
  }
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error('Le code local doit contenir exactement 6 chiffres.');
  }
  return normalizedEmail;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

export async function hasLocalProfile() {
  return Boolean(await getSetting<string>('profileEmail')) && Boolean(await getSetting<string>('pinHash'));
}

export async function getProfileEmail() {
  return (await getSetting<string>('profileEmail')) ?? '';
}

export async function createLocalProfile(email: string, pin: string) {
  const normalizedEmail = assertProfileInput(email, pin);
  const salt = createSalt();
  const pinHash = await hashPin(pin, salt);
  await setSetting('profileEmail', normalizedEmail);
  await setSetting('pinSalt', salt);
  await setSetting('pinHash', pinHash);
  await setSetting('setupComplete', true);
}

export async function verifyPin(pin: string) {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return false;
  const stored = await getSetting<string>('pinHash');
  if (!stored) return false;

  const salt = await getSetting<string>('pinSalt');
  if (salt) return stored === await hashPin(pin, salt);

  // Backward compatibility for profiles created before salted PIN hashes.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  const legacyHash = toHex(new Uint8Array(digest));
  if (stored !== legacyHash) return false;

  // Upgrade the old hash after a successful unlock.
  const newSalt = createSalt();
  await setSetting('pinSalt', newSalt);
  await setSetting('pinHash', await hashPin(pin, newSalt));
  return true;
}
