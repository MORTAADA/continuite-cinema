import { getDatabase, type FilmRecord, type CharacterRecord, type SequenceRecord, type PhotoRecord } from './db';

const MAGIC = 'CCINEMA1';
const BACKUP_FORMAT = 'continuite-cinema-backup';
const BACKUP_VERSION = 1;
type PhotoManifest = { record: Omit<PhotoRecord, 'imageBlob' | 'thumbnailBlob'>; imageSize: number; imageType: string; thumbnailSize: number; thumbnailType: string };
type BackupManifest = { format: string; version: number; createdAt: string; films: FilmRecord[]; characters: CharacterRecord[]; sequences: SequenceRecord[]; photos: PhotoManifest[]; settings: { key: string; value: unknown }[] };

/** Binary single-file backup. Image Blobs are appended unchanged, without base64 expansion or recompression. */
export async function exportBackup(): Promise<Blob> {
  const db = await getDatabase();
  const [films, characters, sequences, photos, settings] = await Promise.all([
    db.getAll('films'), db.getAll('characters'), db.getAll('sequences'), db.getAll('photos'), db.getAll('settings'),
  ]);
  const photoManifest: PhotoManifest[] = photos.map(({ imageBlob, thumbnailBlob, ...record }) => ({
    record, imageSize: imageBlob.size, imageType: imageBlob.type || 'application/octet-stream',
    thumbnailSize: thumbnailBlob?.size ?? 0, thumbnailType: thumbnailBlob?.type || 'application/octet-stream',
  }));
  const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), films, characters, sequences, photos: photoManifest, settings };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > 0xffffffff) throw new Error('Les métadonnées de cette sauvegarde sont trop volumineuses.');
  const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, manifestBytes.byteLength, true);
  const parts: BlobPart[] = [MAGIC, length, manifestBytes];
  for (const photo of photos) { parts.push(photo.imageBlob); if (photo.thumbnailBlob) parts.push(photo.thumbnailBlob); }
  return new Blob(parts, { type: 'application/octet-stream' });
}

export async function restoreBackup(file: File): Promise<{ films: number; characters: number; sequences: number; photos: number }> {
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (prefix.length !== 12 || new TextDecoder().decode(prefix.slice(0, 8)) !== MAGIC) throw new Error('Ce fichier n’est pas une sauvegarde Continuité Cinéma reconnue.');
  const manifestSize = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(8, true);
  if (manifestSize > 100 * 1024 * 1024 || 12 + manifestSize > file.size) throw new Error('L’en-tête de sauvegarde est invalide ou trop volumineux.');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + manifestSize).arrayBuffer())); }
  catch { throw new Error('Les métadonnées de sauvegarde sont illisibles.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Structure de sauvegarde invalide.');
  const p = parsed as Partial<BackupManifest>;
  if (p.format !== BACKUP_FORMAT || p.version !== BACKUP_VERSION) throw new Error('Format ou version de sauvegarde non pris en charge.');
  if (![p.films, p.characters, p.sequences, p.photos, p.settings].every(Array.isArray)) throw new Error('La sauvegarde est incomplète.');
  const films = p.films as FilmRecord[]; const characters = p.characters as CharacterRecord[]; const sequences = p.sequences as SequenceRecord[];
  const photoManifest = p.photos as PhotoManifest[]; const settings = p.settings as { key: string; value: unknown }[];
  const filmById = new Map(films.map(x => [x.id, x])); const characterById = new Map(characters.map(x => [x.id, x])); const sequenceById = new Map(sequences.map(x => [x.id, x]));
  if (filmById.size !== films.length || characterById.size !== characters.length || sequenceById.size !== sequences.length || new Set(photoManifest.map(x => x?.record?.id)).size !== photoManifest.length) throw new Error('La sauvegarde contient des identifiants en double. Les données actuelles n’ont pas été modifiées.');
  if (films.some(x => !x?.id || !x.title) || characters.some(x => !x?.id || !filmById.has(x.filmId))) throw new Error('La sauvegarde contient des films ou personnages invalides. Les données actuelles n’ont pas été modifiées.');
  for (const sequence of sequences) {
    const linked = sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId];
    if (!sequence?.id || !filmById.has(sequence.filmId) || !linked.length || new Set(linked).size !== linked.length || !linked.includes(sequence.characterId) || linked.some(cid => characterById.get(cid)?.filmId !== sequence.filmId)) throw new Error('Une séquence contient des relations invalides. Les données actuelles n’ont pas été modifiées.');
  }
  let offset = 12 + manifestSize; const photos: PhotoRecord[] = [];
  for (const item of photoManifest) {
    const parentSequence = item?.record ? sequenceById.get(item.record.sequenceId) : undefined;
    const linkedCharacterIds = parentSequence?.characterIds?.length ? parentSequence.characterIds : parentSequence ? [parentSequence.characterId] : [];
    if (!item?.record?.id || !parentSequence || !filmById.has(item.record.filmId) || parentSequence.filmId !== item.record.filmId || characterById.get(item.record.characterId)?.filmId !== item.record.filmId || !linkedCharacterIds.includes(item.record.characterId) || !Number.isSafeInteger(item.imageSize) || item.imageSize <= 0 || !Number.isSafeInteger(item.thumbnailSize) || item.thumbnailSize < 0) throw new Error('Une image ou une relation de la sauvegarde est invalide. Les données actuelles n’ont pas été modifiées.');
    const endImage = offset + item.imageSize; const endThumbnail = endImage + item.thumbnailSize;
    if (endThumbnail > file.size) throw new Error('Le fichier de sauvegarde est incomplet. Les données actuelles n’ont pas été modifiées.');
    const imageBlob = file.slice(offset, endImage, item.imageType); const thumbnailBlob = item.thumbnailSize ? file.slice(endImage, endThumbnail, item.thumbnailType) : undefined;
    photos.push({ ...item.record, imageBlob, ...(thumbnailBlob ? { thumbnailBlob } : {}) }); offset = endThumbnail;
  }
  if (offset !== file.size) throw new Error('Le fichier contient des données supplémentaires ou une taille incohérente. Les données actuelles n’ont pas été modifiées.');
  const db = await getDatabase(); const tx = db.transaction(['films', 'characters', 'sequences', 'photos', 'settings'], 'readwrite');
  await Promise.all([tx.objectStore('films').clear(), tx.objectStore('characters').clear(), tx.objectStore('sequences').clear(), tx.objectStore('photos').clear(), tx.objectStore('settings').clear()]);
  for (const x of films) await tx.objectStore('films').put(x);
  for (const x of characters) await tx.objectStore('characters').put(x);
  for (const x of sequences) await tx.objectStore('sequences').put({ ...x, characterIds: x.characterIds?.length ? x.characterIds : [x.characterId] });
  for (const x of photos) await tx.objectStore('photos').put(x);
  for (const x of settings) await tx.objectStore('settings').put(x);
  await tx.done;
  return { films: films.length, characters: characters.length, sequences: sequences.length, photos: photos.length };
}

export async function getStorageStatus() {
  if (!navigator.storage?.estimate) return { usage: undefined, quota: undefined, persisted: undefined };
  const estimate = await navigator.storage.estimate(); let persisted: boolean | undefined;
  try { persisted = navigator.storage.persisted ? await navigator.storage.persisted() : undefined; } catch { persisted = undefined; }
  return { usage: estimate.usage, quota: estimate.quota, persisted };
}
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined;
  return navigator.storage.persist();
}
