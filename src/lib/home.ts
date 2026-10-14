import { getDatabase, getSetting, setSetting, type PhotoRecord } from './db';

export const LAST_SEQUENCE_KEY = 'lastSequenceId';
export const LAST_BACKUP_KEY = 'lastBackupAt';

export async function rememberSequence(sequenceId: string): Promise<void> {
  try { await setSetting(LAST_SEQUENCE_KEY, sequenceId); } catch { /* confort seulement : ne bloque jamais la prise de vue */ }
}
export async function rememberBackup(): Promise<void> {
  try { await setSetting(LAST_BACKUP_KEY, new Date().toISOString()); } catch { /* idem */ }
}

export type HomeData = {
  films: number; photos: number; photosToday: number; sequences: number;
  last?: { sequenceId: string; sequenceName: string; sequenceNumber?: string; filmTitle: string; characters: string; photoCount: number };
  recent: PhotoRecord[];
  lastBackupAt?: string;
};

/** Données de l'accueil. Seules les 6 dernières photos sont chargées (pas toute la photothèque). */
export async function getHomeData(): Promise<HomeData> {
  const db = await getDatabase();
  const [films, characters, sequences, lastSequenceId, lastBackupAt] = await Promise.all([
    db.getAll('films'), db.getAll('characters'), db.getAll('sequences'),
    getSetting<string>(LAST_SEQUENCE_KEY), getSetting<string>(LAST_BACKUP_KEY),
  ]);
  const activeFilms = films.filter(f => !f.archivedAt);
  const activeSequences = sequences.filter(s => !s.archivedAt && activeFilms.some(f => f.id === s.filmId));
  // Parcours inverse par date de prise de vue : on s'arrête après 6 photos actives.
  const recent: PhotoRecord[] = []; let photosToday = 0; let activePhotos = 0; const perSequence = new Map<string, number>();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const tx = db.transaction('photos'); let cursor = await tx.store.index('by-captured').openCursor(null, 'prev');
  while (cursor) {
    const photo = cursor.value as PhotoRecord;
    if (!photo.archivedAt) {
      activePhotos++; perSequence.set(photo.sequenceId, (perSequence.get(photo.sequenceId) ?? 0) + 1);
      if (new Date(photo.capturedAt) >= startOfToday) photosToday++;
      if (recent.length < 6) recent.push(photo);
    }
    cursor = await cursor.continue();
  }
  let last: HomeData['last'];
  const sequence = activeSequences.find(s => s.id === lastSequenceId) ?? activeSequences.find(s => s.id === recent[0]?.sequenceId);
  if (sequence) {
    const names = (sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ');
    const count = perSequence.get(sequence.id) ?? 0;
    last = { sequenceId: sequence.id, sequenceName: sequence.name, sequenceNumber: sequence.sequenceNumber, filmTitle: films.find(f => f.id === sequence.filmId)?.title ?? '', characters: names, photoCount: count };
  }
  return { films: activeFilms.length, photos: activePhotos, photosToday, sequences: activeSequences.length, last, recent, lastBackupAt };
}
