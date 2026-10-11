import { getDatabase, type PhotoRecord } from './db';

const makeId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export async function listPhotos(includeArchived = true): Promise<PhotoRecord[]> {
  const db = await getDatabase();
  return (await db.getAll('photos')).filter(photo => includeArchived || !photo.archivedAt).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function savePhoto(input: {
  sequenceId: string; file: Blob; capturedAt?: string; hairDetails?: string;
  makeupDetails?: string; accessories?: string; notes?: string;
}): Promise<void> {
  const db = await getDatabase();
  const sequence = await db.get('sequences', input.sequenceId);
  if (!sequence || sequence.archivedAt) throw new Error('Sélectionnez une séquence active existante.');
  if (!input.file.type.startsWith('image/')) throw new Error('Choisissez un fichier image.');
  if (input.file.size > 25 * 1024 * 1024) throw new Error('Chaque photo doit faire moins de 25 Mo.');
  const capturedAt = input.capturedAt ? new Date(input.capturedAt).toISOString() : now();
  const photo: PhotoRecord = {
    id: makeId(), sequenceId: sequence.id, characterId: sequence.characterId, filmId: sequence.filmId,
    capturedAt, imageBlob: input.file, hairDetails: input.hairDetails?.trim() ? { details: input.hairDetails.trim() } : undefined,
    makeupDetails: input.makeupDetails?.trim() ? { details: input.makeupDetails.trim() } : undefined,
    accessories: input.accessories?.trim() || undefined, notes: input.notes?.trim() || undefined, createdAt: now(),
  };
  await db.put('photos', photo);
}

export async function deletePhoto(photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('photos', photoId);
}

export async function updatePhoto(photoId: string, input: { capturedAt?: string; hairDetails?: string; makeupDetails?: string; accessories?: string; notes?: string }): Promise<void> {
  const db = await getDatabase(); const photo = await db.get('photos', photoId);
  if (!photo) throw new Error('Photo introuvable.');
  const capturedAt = input.capturedAt ? new Date(input.capturedAt).toISOString() : photo.capturedAt;
  await db.put('photos', { ...photo, capturedAt, hairDetails: input.hairDetails?.trim() ? { details: input.hairDetails.trim() } : undefined, makeupDetails: input.makeupDetails?.trim() ? { details: input.makeupDetails.trim() } : undefined, accessories: input.accessories?.trim() || undefined, notes: input.notes?.trim() || undefined });
}

export async function archivePhoto(photoId: string): Promise<void> {
  const db = await getDatabase(); const photo = await db.get('photos', photoId);
  if (!photo) throw new Error('Photo introuvable.');
  await db.put('photos', { ...photo, archivedAt: now() });
}
export async function restorePhoto(photoId: string): Promise<void> {
  const db = await getDatabase(); const photo = await db.get('photos', photoId);
  if (!photo) throw new Error('Photo introuvable.');
  const { archivedAt: _archived, ...active } = photo; await db.put('photos', active);
}
