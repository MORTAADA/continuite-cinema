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
}): Promise<PhotoRecord> {
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
  return photo;
}

export async function deletePhoto(photoId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('photos', photoId);
}

export type PhotoUpdate = {
  capturedAt?: string; hairDetails?: string; makeupDetails?: string; accessories?: string; notes?: string;
  /** Reclassement : séquence cible et personnage (doit être lié à cette séquence). */
  sequenceId?: string; characterId?: string;
};

/** Met à jour les notes et, si demandé, rattache la photo à une autre séquence/personnage. L'image n'est jamais modifiée. */
export async function updatePhoto(photoId: string, input: PhotoUpdate): Promise<PhotoRecord> {
  const db = await getDatabase(); const photo = await db.get('photos', photoId);
  if (!photo) throw new Error('Photo introuvable.');
  const capturedAt = input.capturedAt ? new Date(input.capturedAt).toISOString() : photo.capturedAt;
  let { sequenceId, characterId, filmId } = photo;
  if (input.sequenceId && (input.sequenceId !== photo.sequenceId || (input.characterId && input.characterId !== photo.characterId))) {
    const sequence = await db.get('sequences', input.sequenceId);
    if (!sequence || sequence.archivedAt) throw new Error('Choisissez une séquence active existante.');
    const linked = sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId];
    const wanted = input.characterId ?? (linked.includes(photo.characterId) ? photo.characterId : sequence.characterId);
    if (!linked.includes(wanted)) throw new Error('Ce personnage n’est pas associé à cette séquence.');
    sequenceId = sequence.id; characterId = wanted; filmId = sequence.filmId;
  }
  const updated: PhotoRecord = {
    ...photo, capturedAt, sequenceId, characterId, filmId,
    hairDetails: input.hairDetails?.trim() ? { details: input.hairDetails.trim() } : undefined,
    makeupDetails: input.makeupDetails?.trim() ? { details: input.makeupDetails.trim() } : undefined,
    accessories: input.accessories?.trim() || undefined, notes: input.notes?.trim() || undefined,
  };
  await db.put('photos', updated);
  return updated;
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
