import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Trash2, X } from 'lucide-react';
import type { CharacterRecord, FilmRecord, PhotoRecord, SequenceRecord } from './lib/db';
import { deletePhoto, updatePhoto } from './lib/photos';

type Props = {
  photo: PhotoRecord;
  films: FilmRecord[];
  characters: CharacterRecord[];
  sequences: SequenceRecord[];
  position: number;
  total: number;
  backLabel: string;
  startWithDetails?: boolean;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSaved: (photo: PhotoRecord) => void;
  onDeleted: (photoId: string) => void;
};

type Draft = {
  capturedAt: string; hairDetails: string; makeupDetails: string; accessories: string; notes: string;
  filmId: string; characterId: string; sequenceId: string;
};
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const linkedIds = (sequence: SequenceRecord) => (sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId]);
const draftFrom = (photo: PhotoRecord): Draft => ({
  capturedAt: toLocalInput(photo.capturedAt), hairDetails: photo.hairDetails?.details ?? '', makeupDetails: photo.makeupDetails?.details ?? '',
  accessories: photo.accessories ?? '', notes: photo.notes ?? '', filmId: photo.filmId, characterId: photo.characterId, sequenceId: photo.sequenceId,
});

/**
 * Visionneuse plein écran. La photo est déjà enregistrée quand elle s'ouvre :
 * toute modification (notes, date, rattachement film / personnage / séquence) est enregistrée automatiquement.
 * Le composant doit être monté avec `key={photo.id}` : un changement de photo réinitialise le brouillon.
 */
export default function PhotoViewer({ photo, films, characters, sequences, position, total, backLabel, startWithDetails, onBack, onPrev, onNext, onSaved, onDeleted }: Props) {
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<Draft>(() => draftFrom(photo));
  const [detailsOpen, setDetailsOpen] = useState(!!startWithDetails);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [busyDelete, setBusyDelete] = useState(false);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.imageBlob); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.imageBlob]);

  /** Écrit le brouillon courant dans IndexedDB. Les écritures sont sérialisées pour éviter les conflits. */
  const persist = useCallback((): Promise<void> => {
    window.clearTimeout(timerRef.current); timerRef.current = undefined;
    if (!dirtyRef.current) return queueRef.current;
    dirtyRef.current = false;
    const snapshot = draftRef.current;
    queueRef.current = queueRef.current.then(async () => {
      if (mountedRef.current) setSaveState('saving');
      try {
        const updated = await updatePhoto(photo.id, {
          capturedAt: snapshot.capturedAt || undefined, hairDetails: snapshot.hairDetails, makeupDetails: snapshot.makeupDetails,
          accessories: snapshot.accessories, notes: snapshot.notes, sequenceId: snapshot.sequenceId, characterId: snapshot.characterId,
        });
        onSavedRef.current(updated);
        if (mountedRef.current) { setSaveState(dirtyRef.current ? 'pending' : 'saved'); setMessage(''); }
      } catch (e) {
        dirtyRef.current = true;
        if (mountedRef.current) { setSaveState('error'); setMessage(e instanceof Error ? e.message : 'Enregistrement automatique impossible.'); }
      }
    });
    return queueRef.current;
  }, [photo.id]);

  const change = (patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next; dirtyRef.current = true;
    setDraft(next); setSaveState('pending'); setMessage('');
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void persist(); }, 700);
  };

  // Dernière écriture quand la visionneuse se ferme ou change de photo.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (dirtyRef.current) void persist(); };
  }, [persist]);

  const leave = async (action?: () => void) => { await persist(); action?.(); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === 'Escape') { event.preventDefault(); void leave(onBack); }
      else if (!typing && event.key === 'ArrowLeft' && onPrev) { event.preventDefault(); void leave(onPrev); }
      else if (!typing && event.key === 'ArrowRight' && onNext) { event.preventDefault(); void leave(onNext); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Listes liées : film → personnage → séquence (les éléments archivés ne sont proposés que s'ils sont déjà sélectionnés).
  const filmOptions = useMemo(() => films.filter(f => !f.archivedAt || f.id === draft.filmId), [films, draft.filmId]);
  const sequencesOfFilm = useMemo(() => sequences.filter(s => s.filmId === draft.filmId && (!s.archivedAt || s.id === draft.sequenceId)), [sequences, draft.filmId, draft.sequenceId]);
  const characterOptions = useMemo(() => characters.filter(c => c.filmId === draft.filmId && (!c.archivedAt || c.id === draft.characterId) && sequencesOfFilm.some(s => linkedIds(s).includes(c.id))), [characters, draft.filmId, draft.characterId, sequencesOfFilm]);
  const sequenceOptions = useMemo(() => sequencesOfFilm.filter(s => linkedIds(s).includes(draft.characterId)), [sequencesOfFilm, draft.characterId]);

  /** Calcule un triplet film / personnage / séquence cohérent après un changement. */
  function relink(patch: { filmId?: string; characterId?: string; sequenceId?: string }) {
    const filmId = patch.filmId ?? draft.filmId;
    const filmSequences = sequences.filter(s => s.filmId === filmId && (!s.archivedAt || s.id === draft.sequenceId));
    const sequencesFor = (characterId: string) => filmSequences.filter(s => linkedIds(s).includes(characterId));
    const filmCharacters = characters.filter(c => c.filmId === filmId && (!c.archivedAt || c.id === draft.characterId));
    let characterId = patch.characterId ?? draft.characterId;
    if (!filmCharacters.some(c => c.id === characterId) || !sequencesFor(characterId).length) characterId = filmCharacters.find(c => sequencesFor(c.id).length)?.id ?? '';
    if (!characterId) { setMessage('Ce film n’a encore aucune séquence liée à un personnage. Créez-en une avant de classer la photo ici.'); return; }
    const candidates = sequencesFor(characterId);
    const sequenceId = candidates.some(s => s.id === patch.sequenceId) ? patch.sequenceId! : candidates.some(s => s.id === draft.sequenceId) && !patch.filmId && !patch.characterId ? draft.sequenceId : candidates[0].id;
    change({ filmId, characterId, sequenceId });
  }

  async function remove() {
    if (!window.confirm('Supprimer définitivement cette photo de cet appareil ? Les copies de sauvegarde exportées auparavant ne seront pas supprimées.')) return;
    setBusyDelete(true);
    try {
      window.clearTimeout(timerRef.current); dirtyRef.current = false;
      await queueRef.current;
      await deletePhoto(photo.id);
      onDeleted(photo.id);
    } catch { setBusyDelete(false); setSaveState('error'); setMessage('La suppression a échoué.'); }
  }

  const sequence = sequences.find(s => s.id === draft.sequenceId);
  const statusText = saveState === 'pending' ? 'Modifications en attente…' : saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' ? 'Enregistré automatiquement ✓' : saveState === 'error' ? 'Non enregistré' : 'Photo enregistrée ✓';

  return <div className="viewer" role="dialog" aria-modal="true" aria-label="Aperçu de la photo">
    <header className="viewer-top">
      <button type="button" className="viewer-back" aria-label={backLabel} onClick={() => void leave(onBack)}><ArrowLeft size={19}/><span>{backLabel}</span></button>
      <div className="viewer-title"><strong>{sequence ? `${sequence.sequenceNumber ? `${sequence.sequenceNumber} — ` : ''}${sequence.name}` : 'Photo'}</strong><small className={`viewer-status viewer-status-${saveState}`} aria-live="polite">{total > 1 ? `${position} / ${total} · ` : ''}{statusText}</small></div>
      <button type="button" className={`viewer-icon ${detailsOpen ? 'is-on' : ''}`} aria-pressed={detailsOpen} aria-label="Détails et classement" title="Détails et classement" onClick={() => setDetailsOpen(v => !v)}><Info size={20}/><span>Détails</span></button>
      <button type="button" className="viewer-icon viewer-delete" aria-label="Supprimer la photo" title="Supprimer la photo" disabled={busyDelete} onClick={() => void remove()}><Trash2 size={20}/><span>Supprimer</span></button>
    </header>
    <div className="viewer-body">
      <div className="viewer-stage" onTouchStart={e => { touchStart.current = e.touches[0].clientX; }} onTouchEnd={e => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current; touchStart.current = null;
        if (Math.abs(dx) < 70) return;
        if (dx > 0 && onPrev) void leave(onPrev); else if (dx < 0 && onNext) void leave(onNext);
      }}>
        {url && <img src={url} alt={`Photo de continuité${sequence ? ` — ${sequence.name}` : ''}`} draggable={false}/>}
        {onPrev && <button type="button" className="viewer-nav viewer-nav-prev" aria-label="Photo suivante (plus récente)" onClick={() => void leave(onPrev)}><ChevronLeft size={26}/></button>}
        {onNext && <button type="button" className="viewer-nav viewer-nav-next" aria-label="Photo précédente (plus ancienne)" onClick={() => void leave(onNext)}><ChevronRight size={26}/></button>}
      </div>
      {detailsOpen && <section className="viewer-panel" aria-label="Détails de la photo">
        <div className="viewer-panel-head"><h2>Détails et classement</h2><button type="button" className="viewer-panel-close" aria-label="Fermer les détails" onClick={() => setDetailsOpen(false)}><X size={18}/></button></div>
        <p className="viewer-hint">Les modifications sont enregistrées automatiquement. La photo, elle, est déjà sauvegardée.</p>
        <fieldset className="viewer-links"><legend>Lier cette photo à</legend>
          <label>Film<select value={draft.filmId} onChange={e => relink({ filmId: e.target.value })}>{filmOptions.map(f => <option key={f.id} value={f.id}>{f.title}{f.archivedAt ? ' (archivé)' : ''}</option>)}</select></label>
          <label>Personnage<select value={draft.characterId} onChange={e => relink({ characterId: e.target.value })}>{characterOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Séquence<select value={draft.sequenceId} onChange={e => relink({ sequenceId: e.target.value })}>{sequenceOptions.map(s => <option key={s.id} value={s.id}>{s.sequenceNumber ? `${s.sequenceNumber} — ` : ''}{s.name}{s.archivedAt ? ' (archivée)' : ''}</option>)}</select></label>
        </fieldset>
        <label>Date et heure de référence<input type="datetime-local" value={draft.capturedAt} onChange={e => change({ capturedAt: e.target.value })}/></label>
        <label>Coiffure<textarea rows={2} maxLength={2000} value={draft.hairDetails} onChange={e => change({ hairDetails: e.target.value })}/></label>
        <label>Maquillage<textarea rows={2} maxLength={2000} value={draft.makeupDetails} onChange={e => change({ makeupDetails: e.target.value })}/></label>
        <label>Accessoires<textarea rows={2} maxLength={2000} value={draft.accessories} onChange={e => change({ accessories: e.target.value })}/></label>
        <label>Notes de plateau<textarea rows={3} maxLength={4000} value={draft.notes} onChange={e => change({ notes: e.target.value })}/></label>
        {message && <div className="form-error" role="alert">{message}</div>}
        <button type="button" className="primary-button viewer-done" onClick={() => void leave(onBack)}>{backLabel}</button>
      </section>}
    </div>
  </div>;
}
