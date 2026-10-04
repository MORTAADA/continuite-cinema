import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface FilmRecord {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRecord {
  id: string;
  filmId: string;
  name: string;
  actorName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SequenceRecord {
  id: string;
  characterId: string;
  filmId: string;
  name: string;
  sequenceNumber?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoRecord {
  id: string;
  sequenceId: string;
  characterId: string;
  filmId: string;
  capturedAt: string;
  imageBlob: Blob;
  thumbnailBlob?: Blob;
  hairDetails?: Record<string, string>;
  makeupDetails?: Record<string, string>;
  accessories?: string;
  notes?: string;
  createdAt: string;
}

interface ContinuiteDB extends DBSchema {
  films: { key: string; value: FilmRecord; indexes: { 'by-title': string; 'by-updated': string } };
  characters: { key: string; value: CharacterRecord; indexes: { 'by-film': string; 'by-name': string } };
  sequences: { key: string; value: SequenceRecord; indexes: { 'by-character': string; 'by-film': string; 'by-name': string } };
  photos: { key: string; value: PhotoRecord; indexes: { 'by-sequence': string; 'by-character': string; 'by-film': string; 'by-captured': string } };
  settings: { key: string; value: { key: string; value: unknown } };
}

let dbPromise: Promise<IDBPDatabase<ContinuiteDB>> | undefined;

export function getDatabase() {
  if (!dbPromise) {
    dbPromise = openDB<ContinuiteDB>('continuite-cinema', 1, {
      upgrade(db) {
        const films = db.createObjectStore('films', { keyPath: 'id' });
        films.createIndex('by-title', 'title');
        films.createIndex('by-updated', 'updatedAt');

        const characters = db.createObjectStore('characters', { keyPath: 'id' });
        characters.createIndex('by-film', 'filmId');
        characters.createIndex('by-name', 'name');

        const sequences = db.createObjectStore('sequences', { keyPath: 'id' });
        sequences.createIndex('by-character', 'characterId');
        sequences.createIndex('by-film', 'filmId');
        sequences.createIndex('by-name', 'name');

        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-sequence', 'sequenceId');
        photos.createIndex('by-character', 'characterId');
        photos.createIndex('by-film', 'filmId');
        photos.createIndex('by-captured', 'capturedAt');

        db.createObjectStore('settings', { keyPath: 'key' });
      },
    }).catch((error: unknown) => {
      // Allow a later retry if the browser temporarily blocks IndexedDB.
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise;
}

export async function getLocalCounts() {
  const db = await getDatabase();
  const [films, characters, sequences, photos] = await Promise.all([
    db.count('films'), db.count('characters'), db.count('sequences'), db.count('photos'),
  ]);
  return { films, characters, sequences, photos };
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDatabase();
  return (await db.get('settings', key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  const db = await getDatabase();
  await db.put('settings', { key, value });
}
