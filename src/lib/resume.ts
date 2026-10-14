import { getDatabase, getSetting, setSetting, type SequenceRecord } from './db';
import { listRecentPhotos } from './photos';

const KEY = 'lastSequenceId';

/** Mémorise la dernière séquence ouverte pour le bouton « Photographier » de l’accueil. */
export async function rememberSequence(sequenceId: string): Promise<void> {
  try { await setSetting(KEY, sequenceId); } catch { /* non bloquant */ }
}

/** Séquence active à proposer : dernière ouverte, sinon celle de la dernière photo, sinon la plus récente. */
export async function getResumeSequence(): Promise<SequenceRecord | undefined> {
  const db = await getDatabase();
  const [films, sequences] = await Promise.all([db.getAll('films'), db.getAll('sequences')]);
  const activeFilms = new Set(films.filter(f => !f.archivedAt).map(f => f.id));
  const usable = (s?: SequenceRecord) => !!s && !s.archivedAt && activeFilms.has(s.filmId);
  const byId = new Map(sequences.map(s => [s.id, s]));
  const remembered = byId.get((await getSetting<string>(KEY)) ?? '');
  if (usable(remembered)) return remembered;
  for (const photo of await listRecentPhotos(30)) { const s = byId.get(photo.sequenceId); if (usable(s)) return s; }
  return sequences.filter(usable).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
