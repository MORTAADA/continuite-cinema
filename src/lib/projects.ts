import { getDatabase, type FilmRecord, type CharacterRecord, type SequenceRecord } from './db';

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export async function listFilms(): Promise<FilmRecord[]> {
  const db = await getDatabase();
  return (await db.getAll('films')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveFilm(input: { id?: string; title: string; description?: string }): Promise<void> {
  const db = await getDatabase();
  const timestamp = now();
  const previous = input.id ? await db.get('films', input.id) : undefined;
  const title = input.title.trim();
  if (!title) throw new Error('Le titre du film est obligatoire.');
  await db.put('films', { id: input.id ?? id(), title, description: input.description?.trim() || undefined, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp });
}
export async function deleteFilm(filmId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['films', 'characters', 'sequences', 'photos'], 'readwrite');
  const characters = await tx.objectStore('characters').index('by-film').getAllKeys(filmId);
  const sequences = await tx.objectStore('sequences').index('by-film').getAllKeys(filmId);
  for (const key of sequences) await tx.objectStore('sequences').delete(key);
  for (const key of characters) await tx.objectStore('characters').delete(key);
  const photos = await tx.objectStore('photos').index('by-film').getAllKeys(filmId);
  for (const key of photos) await tx.objectStore('photos').delete(key);
  await tx.objectStore('films').delete(filmId);
  await tx.done;
}
export async function listCharacters(): Promise<CharacterRecord[]> {
  const db = await getDatabase();
  return (await db.getAll('characters')).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
export async function saveCharacter(input: { id?: string; filmId: string; name: string; actorName?: string; notes?: string }): Promise<void> {
  const db = await getDatabase();
  const timestamp = now();
  const previous = input.id ? await db.get('characters', input.id) : undefined;
  const name = input.name.trim();
  if (!name) throw new Error('Le nom du personnage est obligatoire.');
  if (!await db.get('films', input.filmId)) throw new Error('Sélectionnez un film existant.');
  await db.put('characters', { id: input.id ?? id(), filmId: input.filmId, name, actorName: input.actorName?.trim() || undefined, notes: input.notes?.trim() || undefined, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp });
  if (previous && previous.filmId !== input.filmId) {
    const tx = db.transaction(['sequences', 'photos'], 'readwrite');
    const sequences = await tx.objectStore('sequences').index('by-character').getAll(input.id!);
    for (const sequence of sequences) await tx.objectStore('sequences').put({ ...sequence, filmId: input.filmId, updatedAt: timestamp });
    const photos = await tx.objectStore('photos').index('by-character').getAll(input.id!);
    for (const photo of photos) await tx.objectStore('photos').put({ ...photo, filmId: input.filmId });
    await tx.done;
  }
}
export async function deleteCharacter(characterId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['characters', 'sequences', 'photos'], 'readwrite');
  const sequences = await tx.objectStore('sequences').index('by-character').getAllKeys(characterId);
  for (const key of sequences) await tx.objectStore('sequences').delete(key);
  const photos = await tx.objectStore('photos').index('by-character').getAllKeys(characterId);
  for (const key of photos) await tx.objectStore('photos').delete(key);
  await tx.objectStore('characters').delete(characterId);
  await tx.done;
}
export async function listSequences(): Promise<SequenceRecord[]> {
  const db = await getDatabase();
  return (await db.getAll('sequences')).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
export async function saveSequence(input: { id?: string; characterId: string; name: string; sequenceNumber?: string; description?: string }): Promise<void> {
  const db = await getDatabase();
  const character = await db.get('characters', input.characterId);
  if (!character) throw new Error('Sélectionnez un personnage existant.');
  const timestamp = now();
  const previous = input.id ? await db.get('sequences', input.id) : undefined;
  const name = input.name.trim();
  if (!name) throw new Error('Le nom de la séquence est obligatoire.');
  await db.put('sequences', { id: input.id ?? id(), characterId: character.id, filmId: character.filmId, name, sequenceNumber: input.sequenceNumber?.trim() || undefined, description: input.description?.trim() || undefined, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp });
  if (previous && previous.characterId !== character.id) {
    const tx = db.transaction('photos', 'readwrite');
    const photos = await tx.store.index('by-sequence').getAll(input.id!);
    for (const photo of photos) await tx.store.put({ ...photo, characterId: character.id, filmId: character.filmId });
    await tx.done;
  }
}
export async function deleteSequence(sequenceId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['sequences', 'photos'], 'readwrite');
  const photos = await tx.objectStore('photos').index('by-sequence').getAllKeys(sequenceId);
  for (const key of photos) await tx.objectStore('photos').delete(key);
  await tx.objectStore('sequences').delete(sequenceId);
  await tx.done;
}
