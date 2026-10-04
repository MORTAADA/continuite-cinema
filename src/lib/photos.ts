import { getDatabase, type PhotoRecord } from './db';

const makeId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export async function listPhotos(): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  return (await db.getAll('photos')).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function savePhoto(input: {
  sequenceId?: string; file: File; capturedAt: string; hairDetails?: string;
  makeupDetails?: string; accessories?: string; notes?: string;
}): Promise<void> {
  const db = await getDatabase();
  const sequence = input.sequenceId ? await db.get('sequences', input.sequenceId) : undefined;
  if (input.sequenceId && !sequence) throw new Error('La séquence sélectionnée n’existe plus.');
  if (!input.file.type.startsWith('image/')) throw new Error('Choisissez un fichier image.');
  if (input.file.size > 100 * 1024 * 1024) throw new Error('Chaque photo doit faire moins de 100 Mo.');
  const capturedAt = input.capturedAt ? new Date(input.capturedAt).toISOString() : now();
  const photo: PhotoRecord = {
    id: makeId(), sequenceId: sequence?.id, characterId: sequence?.characterId, filmId: sequence?.filmId,
    capturedAt, imageBlob: input.file, hairDetails: input.hairDetails?.trim() ? { details: input.hairDetails.trim() } : undefined,
    makeupDetails: input.makeupDetails?.trim() ? { details: input.makeupDetails.trim() } : undefined,
    accessories: input.accessories?.trim() || undefined, notes: input.notes?.trim() || undefined, createdAt: now(),
  };
  await db.put('photos', photo);
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}

export async function getStorageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {};
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage, quota: estimate.quota };
  } catch { return {}; }
}

export async function deletePhoto(photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('photos', photoId);
}
