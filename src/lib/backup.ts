import { getDatabase, type CharacterRecord, type FilmRecord, type PhotoRecord, type SequenceRecord } from './db';

type BackupPhoto = Omit<PhotoRecord, 'imageBlob' | 'thumbnailBlob'> & {
  imageBlob: { type: string; data: string };
  thumbnailBlob?: { type: string; data: string };
};

export interface ContinuiteBackup {
  format: 'continuite-cinema-backup';
  version: 1;
  exportedAt: string;
  films: FilmRecord[];
  characters: CharacterRecord[];
  sequences: SequenceRecord[];
  photos: BackupPhoto[];
  settings: { key: string; value: unknown }[];
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encodeBlob(blob?: Blob) {
  if (!blob) return undefined;
  return { type: blob.type || 'application/octet-stream', data: bytesToBase64(await blob.arrayBuffer()) };
}

async function decodeBlob(value: { type: string; data: string }) {
  return new Blob([base64ToBytes(value.data)], { type: value.type });
}

export async function createBackup(): Promise<ContinuiteBackup> {
  const db = await getDatabase();
  const [films, characters, sequences, photos, settings] = await Promise.all([
    db.getAll('films'), db.getAll('characters'), db.getAll('sequences'), db.getAll('photos'), db.getAll('settings'),
  ]);
  const encodedPhotos = await Promise.all(photos.map(async photo => ({
    id: photo.id,
    sequenceId: photo.sequenceId,
    characterId: photo.characterId,
    filmId: photo.filmId,
    capturedAt: photo.capturedAt,
    imageBlob: (await encodeBlob(photo.imageBlob))!,
    thumbnailBlob: await encodeBlob(photo.thumbnailBlob),
    hairDetails: photo.hairDetails,
    makeupDetails: photo.makeupDetails,
    accessories: photo.accessories,
    notes: photo.notes,
    createdAt: photo.createdAt,
  })));
  return { format: 'continuite-cinema-backup', version: 1, exportedAt: new Date().toISOString(), films, characters, sequences, photos: encodedPhotos, settings };
}

export async function downloadBackup() {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `continuite-cinema-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return backup;
}

export async function restoreBackup(file: File) {
  if (file.size > 1024 * 1024 * 1024) throw new Error('La sauvegarde dépasse 1 Go.');
  let backup: ContinuiteBackup;
  try { backup = JSON.parse(await file.text()) as ContinuiteBackup; } catch { throw new Error('Fichier de sauvegarde JSON invalide.'); }
  if (backup.format !== 'continuite-cinema-backup' || backup.version !== 1) throw new Error('Format de sauvegarde non reconnu.');
  if (!Array.isArray(backup.films) || !Array.isArray(backup.characters) || !Array.isArray(backup.sequences) || !Array.isArray(backup.photos)) throw new Error('Sauvegarde incomplète.');
  const db = await getDatabase();
  const tx = db.transaction(['films', 'characters', 'sequences', 'photos', 'settings'], 'readwrite');
  for (const store of ['films', 'characters', 'sequences', 'photos', 'settings'] as const) await tx.objectStore(store).clear();
  for (const item of backup.films) await tx.objectStore('films').put(item);
  for (const item of backup.characters) await tx.objectStore('characters').put(item);
  for (const item of backup.sequences) await tx.objectStore('sequences').put(item);
  for (const item of backup.photos) {
    await tx.objectStore('photos').put({ ...item, imageBlob: await decodeBlob(item.imageBlob), thumbnailBlob: item.thumbnailBlob ? await decodeBlob(item.thumbnailBlob) : undefined });
  }
  for (const item of backup.settings ?? []) await tx.objectStore('settings').put(item);
  await tx.done;
  return { films: backup.films.length, characters: backup.characters.length, sequences: backup.sequences.length, photos: backup.photos.length };
}

export async function clearAllLocalData() {
  const db = await getDatabase();
  const tx = db.transaction(['films', 'characters', 'sequences', 'photos', 'settings'], 'readwrite');
  for (const store of ['films', 'characters', 'sequences', 'photos', 'settings'] as const) await tx.objectStore(store).clear();
  await tx.done;
}
