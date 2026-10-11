import { getDatabase, type FilmRecord, type CharacterRecord, type SequenceRecord } from './db';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export async function listFilms(includeArchived = true): Promise<FilmRecord[]> {
  const db = await getDatabase(); const items = await db.getAll('films');
  return items.filter(x => includeArchived || !x.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveFilm(input: { id?: string; title: string; description?: string; imageDataUrl?: string }): Promise<void> {
  const db = await getDatabase(); const timestamp = now(); const previous = input.id ? await db.get('films', input.id) : undefined;
  const title = input.title.trim(); if (!title) throw new Error('Le titre du film est obligatoire.');
  await db.put('films', { id: input.id ?? id(), title, description: input.description?.trim() || undefined, imageDataUrl: input.imageDataUrl ?? previous?.imageDataUrl, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, archivedAt: previous?.archivedAt });
}
export async function archiveFilm(filmId: string): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['films', 'characters', 'sequences'], 'readwrite'); const stamp = now();
  const film = await tx.objectStore('films').get(filmId); if (!film) throw new Error('Film introuvable.');
  await tx.objectStore('films').put({ ...film, archivedAt: stamp, updatedAt: stamp });
  for (const c of await tx.objectStore('characters').index('by-film').getAll(filmId)) if (!c.archivedAt) await tx.objectStore('characters').put({ ...c, archivedAt: stamp, archivedByFilmId: filmId, updatedAt: stamp });
  for (const s of await tx.objectStore('sequences').index('by-film').getAll(filmId)) if (!s.archivedAt) await tx.objectStore('sequences').put({ ...s, archivedAt: stamp, archivedByFilmId: filmId, updatedAt: stamp });
  await tx.done;
}
export async function restoreFilm(filmId: string): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['films', 'characters', 'sequences'], 'readwrite');
  const film = await tx.objectStore('films').get(filmId); if (!film) throw new Error('Film introuvable.');
  const { archivedAt: _archived, ...activeFilm } = film; await tx.objectStore('films').put({ ...activeFilm, updatedAt: now() });
  for (const c of await tx.objectStore('characters').index('by-film').getAll(filmId)) if (c.archivedByFilmId === filmId) { const { archivedAt: _a, archivedByFilmId: _b, ...active } = c; await tx.objectStore('characters').put({ ...active, updatedAt: now() }); }
  for (const s of await tx.objectStore('sequences').index('by-film').getAll(filmId)) if (s.archivedByFilmId === filmId) { const { archivedAt: _a, archivedByFilmId: _b, ...active } = s; await tx.objectStore('sequences').put({ ...active, updatedAt: now() }); }
  await tx.done;
}
export async function deleteFilm(filmId: string): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['films', 'characters', 'sequences', 'photos'], 'readwrite');
  const characters = await tx.objectStore('characters').index('by-film').getAllKeys(filmId);
  const sequences = await tx.objectStore('sequences').index('by-film').getAllKeys(filmId);
  const photos = await tx.objectStore('photos').index('by-film').getAllKeys(filmId);
  for (const key of photos) await tx.objectStore('photos').delete(key);
  for (const key of sequences) await tx.objectStore('sequences').delete(key);
  for (const key of characters) await tx.objectStore('characters').delete(key);
  await tx.objectStore('films').delete(filmId); await tx.done;
}
export async function listCharacters(includeArchived = true): Promise<CharacterRecord[]> {
  const db = await getDatabase(); return (await db.getAll('characters')).filter(x => includeArchived || !x.archivedAt).sort((a,b) => a.name.localeCompare(b.name,'fr'));
}
export async function saveCharacter(input: { id?: string; filmId: string; name: string; actorName?: string; notes?: string; imageDataUrl?: string }): Promise<void> {
  const db = await getDatabase(); const timestamp = now(); const previous = input.id ? await db.get('characters', input.id) : undefined; const name = input.name.trim();
  if (!name) throw new Error('Le nom du personnage est obligatoire.');
  if (!await db.get('films', input.filmId)) throw new Error('Sélectionnez un film existant.');
  if (previous && previous.filmId !== input.filmId) throw new Error('Pour préserver les relations, créez une nouvelle fiche si le personnage doit changer de film.');
  await db.put('characters', { id: input.id ?? id(), filmId: input.filmId, name, actorName: input.actorName?.trim() || undefined, notes: input.notes?.trim() || undefined, imageDataUrl: input.imageDataUrl ?? previous?.imageDataUrl, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, archivedAt: previous?.archivedAt, archivedByFilmId: previous?.archivedByFilmId });
}
export async function archiveCharacter(characterId: string): Promise<void> {
  const db = await getDatabase(); const c = await db.get('characters', characterId);
  if (!c) throw new Error('Personnage introuvable.');
  await db.put('characters', { ...c, archivedAt: now(), updatedAt: now() });
}
export async function restoreCharacter(characterId: string): Promise<void> {
  const db = await getDatabase(); const c = await db.get('characters', characterId); if (!c) throw new Error('Personnage introuvable.');
  const film = await db.get('films', c.filmId); if (film?.archivedAt) throw new Error('Restaurez d’abord le film auquel appartient ce personnage.');
  const { archivedAt: _a, archivedByFilmId: _b, ...active } = c; await db.put('characters', { ...active, updatedAt: now() });
}
export async function deleteCharacter(characterId: string): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['characters', 'sequences', 'photos'], 'readwrite');
  const related = await tx.objectStore('sequences').index('by-characters').getAll(characterId);
  for (const sequence of related) {
    const ids = (sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId]).filter(x => x !== characterId);
    const photos = await tx.objectStore('photos').index('by-sequence').getAll(sequence.id);
    if (ids.length) {
      await tx.objectStore('sequences').put({ ...sequence, characterIds: ids, characterId: ids[0], updatedAt: now() });
      for (const photo of photos) await tx.objectStore('photos').put({ ...photo, characterId: ids[0] });
    } else {
      for (const photo of photos) await tx.objectStore('photos').delete(photo.id);
      await tx.objectStore('sequences').delete(sequence.id);
    }
  }
  await tx.objectStore('characters').delete(characterId); await tx.done;
}
export async function listSequences(includeArchived = true): Promise<SequenceRecord[]> {
  const db = await getDatabase(); return (await db.getAll('sequences')).filter(x => includeArchived || !x.archivedAt).map(x => ({ ...x, characterIds: x.characterIds?.length ? x.characterIds : [x.characterId] })).sort((a,b) => a.name.localeCompare(b.name,'fr'));
}
export async function saveSequence(input: { id?: string; characterId: string; characterIds?: string[]; name: string; sequenceNumber?: string; description?: string; imageDataUrl?: string }): Promise<void> {
  const db = await getDatabase(); const ids = [...new Set((input.characterIds?.length ? input.characterIds : [input.characterId]).filter(Boolean))];
  if (!ids.length) throw new Error('Sélectionnez au moins un personnage.');
  const linkedCharacters = await Promise.all(ids.map(cid => db.get('characters', cid)));
  if (linkedCharacters.some(c => !c)) throw new Error('Un personnage sélectionné n’existe plus.');
  const filmId = linkedCharacters[0]!.filmId;
  if (linkedCharacters.some(c => c!.filmId !== filmId)) throw new Error('Une même séquence ne peut être liée qu’à des personnages du même film.');
  const timestamp = now(); const previous = input.id ? await db.get('sequences', input.id) : undefined; const name = input.name.trim();
  if (!name) throw new Error('Le nom de la séquence est obligatoire.');
  if (previous && previous.filmId !== filmId) throw new Error('La séquence ne peut pas changer de film.');
  await db.put('sequences', { id: input.id ?? id(), characterId: ids[0], characterIds: ids, filmId, name, sequenceNumber: input.sequenceNumber?.trim() || undefined, description: input.description?.trim() || undefined, imageDataUrl: input.imageDataUrl ?? previous?.imageDataUrl, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, archivedAt: previous?.archivedAt, archivedByFilmId: previous?.archivedByFilmId });
  if (previous && previous.characterId !== ids[0]) {
    const tx = db.transaction('photos', 'readwrite'); const photos = await tx.store.index('by-sequence').getAll(input.id!);
    for (const p of photos) await tx.store.put({ ...p, characterId: ids[0], filmId }); await tx.done;
  }
}
export async function archiveSequence(sequenceId: string): Promise<void> { const db = await getDatabase(); const s = await db.get('sequences', sequenceId); if (!s) throw new Error('Séquence introuvable.'); await db.put('sequences', { ...s, archivedAt: now(), updatedAt: now() }); }
export async function restoreSequence(sequenceId: string): Promise<void> { const db = await getDatabase(); const s = await db.get('sequences', sequenceId); if (!s) throw new Error('Séquence introuvable.'); const film = await db.get('films', s.filmId); if (film?.archivedAt) throw new Error('Restaurez d’abord le film auquel appartient cette séquence.'); const { archivedAt: _a, archivedByFilmId: _b, ...active } = s; await db.put('sequences', { ...active, updatedAt: now() }); }
export async function deleteSequence(sequenceId: string): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['sequences', 'photos'], 'readwrite');
  const photos = await tx.objectStore('photos').index('by-sequence').getAllKeys(sequenceId); for (const key of photos) await tx.objectStore('photos').delete(key);
  await tx.objectStore('sequences').delete(sequenceId); await tx.done;
}
