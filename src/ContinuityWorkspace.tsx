import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, ImagePlus, Trash2, CalendarDays, Search, X, SwitchCamera, Download, Pencil } from 'lucide-react';
import type { FilmRecord, CharacterRecord, SequenceRecord, PhotoRecord } from './lib/db';
import { getDatabase } from './lib/db';
import { deletePhoto, listPhotos, savePhoto, updatePhoto } from './lib/photos';

type Props = { query: string; onDataChanged: () => void; initialAction?: 'camera' | 'images'; onActionHandled?: () => void };

export default function ContinuityWorkspace({ query, onDataChanged, initialAction, onActionHandled }: Props) {
  const [films, setFilms] = useState<FilmRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [sequences, setSequences] = useState<SequenceRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [sequenceId, setSequenceId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [editingPhoto, setEditingPhoto] = useState<PhotoRecord | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refresh = async () => {
    const db = await getDatabase();
    const [f, c, s, p] = await Promise.all([db.getAll('films'), db.getAll('characters'), db.getAll('sequences'), listPhotos()]);
    setFilms(f); setCharacters(c); setSequences(s); setPhotos(p);
    setSequenceId(current => s.some(item => item.id === current) ? current : (s[0]?.id ?? ''));
  };
  useEffect(() => { void refresh().catch(() => setError('Impossible de lire les données locales.')); }, []);

  useEffect(() => {
    if (initialAction === 'camera') {
      setShowForm(true); setCameraError(''); setCameraOpen(true); onActionHandled?.();
    } else if (initialAction === 'images') {
      setShowForm(true); onActionHandled?.();
    }
  }, [initialAction, sequences.length]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    async function startCamera() {
      setCameraError('');
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('La caméra n’est pas disponible dans ce navigateur. Ouvrez l’application via localhost ou HTTPS.');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch (e) {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (!cancelled) setCameraError(e instanceof Error ? e.message : 'Impossible d’ouvrir la caméra. Vérifiez les autorisations.');
      }
    }
    void startCamera();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  }, [cameraOpen, cameraFacing]);

  function closeCamera() { setCameraOpen(false); }

  function switchCamera() {
    setCameraError('');
    setCameraFacing(current => current === 'environment' ? 'user' : 'environment');
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) { setCameraError('La caméra n’est pas encore prête.'); return; }
    setCameraBusy(true); setCameraError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Impossible de préparer la photo.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('La photo n’a pas pu être créée.')), 'image/png'));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const captured = new File([blob], `continuite-${stamp}.png`, { type: 'image/png', lastModified: Date.now() });
      // Garder la capture en attente permet de lui associer la séquence et les
      // informations coiffure/maquillage avant l'enregistrement définitif.
      setCapturedFiles(current => [...current, captured]);
      setCameraOpen(false);
      setNotice('Photo capturée. Ajoutez les informations de continuité puis enregistrez.');

    } catch (e) { setCameraError(e instanceof Error ? e.message : 'La capture a échoué.'); }
    finally { setCameraBusy(false); }
  }

  const normalized = query.trim().toLocaleLowerCase('fr');
  const visiblePhotos = useMemo(() => photos.filter(photo => {
    const sequence = sequences.find(s => s.id === photo.sequenceId);
    const character = characters.find(c => c.id === photo.characterId);
    const film = films.find(f => f.id === photo.filmId);
    const haystack = [sequence?.name, sequence?.sequenceNumber, character?.name, character?.actorName, film?.title, photo.accessories, photo.notes, photo.hairDetails?.details, photo.makeupDetails?.details, photo.capturedAt, new Date(photo.capturedAt).toLocaleDateString('fr-FR')].join(' ').toLocaleLowerCase('fr');
    return haystack.includes(normalized);
  }), [photos, sequences, characters, films, normalized]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const form = event.currentTarget; const data = new FormData(form);
    const files = [...data.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0), ...capturedFiles];
    if (!files.length) { setError('Choisissez au moins une photo.'); return; }
    setBusy(true);
    try {
      for (const file of files) await savePhoto({ sequenceId: sequenceId || undefined, file, capturedAt: String(data.get('capturedAt') ?? ''), hairDetails: String(data.get('hairDetails') ?? ''), makeupDetails: String(data.get('makeupDetails') ?? ''), accessories: String(data.get('accessories') ?? ''), notes: String(data.get('notes') ?? '') });
      form.reset(); setCapturedFiles([]); setShowForm(false); setNotice(`${files.length} photo(s) enregistrée(s) sur cet appareil.`); await refresh(); onDataChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }

  async function remove(photo: PhotoRecord) {
    if (!window.confirm('Supprimer cette photo et ses informations de continuité ?')) return;
    try { await deletePhoto(photo.id); await refresh(); onDataChanged(); setNotice('Photo supprimée.'); setError(''); }
    catch { setError('La suppression a échoué.'); }
  }

  return <div className="workspace-stack">
    <div className="workspace-toolbar"><div><div className="eyebrow">RÉFÉRENCES DE PLATEAU</div><p>{photos.length} photo(s) · Coiffure, maquillage et accessoires</p></div><button type="button" className="primary-button" onClick={() => { setShowForm(v => !v); setError(''); }}><ImagePlus size={17}/>{showForm ? 'Fermer le formulaire' : 'Ajouter des photos'}</button></div>
    {!sequences.length && <div className="workspace-notice">Vous pouvez maintenant enregistrer des photos indépendantes, sans créer de film, personnage ou séquence.</div>}
    {notice && <div className="workspace-notice">{notice}</div>}{error && <div className="form-error">{error}</div>}
    {showForm && <section className="content-card continuity-form-card"><div className="editor-heading"><div><div className="eyebrow">NOUVELLE RÉFÉRENCE</div><h2>Ajouter des photos</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setShowForm(false)}><X size={18}/></button></div>
      <form className="project-form" onSubmit={submit}>
        <label>Séquence associée (facultatif)<select value={sequenceId} onChange={e => setSequenceId(e.target.value)}><option value="">Aucune — photo indépendante</option>{sequences.map(s => <option value={s.id} key={s.id}>{s.sequenceNumber ? `${s.sequenceNumber} — ` : ''}{s.name} · {characters.find(c => c.id === s.characterId)?.name} · {films.find(f => f.id === s.filmId)?.title}</option>)}</select></label>
        <div className="camera-actions"><button type="button" className="primary-button" onClick={() => { setCameraError(''); setCameraOpen(true); }}><Camera size={17}/>Prendre une photo</button><span>{capturedFiles.length} photo(s) prise(s) avec la caméra</span></div>
        {capturedFiles.length > 0 && <div className="captured-list"><strong>{capturedFiles.length} photo(s) en attente d’enregistrement</strong><button type="button" className="text-button" onClick={() => setCapturedFiles([])}>Tout retirer</button></div>}
        <label>Importer depuis la galerie *<input name="photos" type="file" accept="image/*" multiple /></label>
        <div className="field-hint">Images JPG, PNG ou WebP · 100 Mo maximum par photo. Les fichiers restent sur cet appareil. Vous pouvez combiner caméra et galerie.</div>
        <label>Date et heure de référence<input name="capturedAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)} /></label>
        <div className="continuity-fields"><label>Coiffure<textarea name="hairDetails" rows={2} maxLength={2000} placeholder="Raie, volume, mèches, fixation…"/></label><label>Maquillage<textarea name="makeupDetails" rows={2} maxLength={2000} placeholder="Teint, yeux, lèvres, effets…"/></label></div>
        <label>Accessoires<textarea name="accessories" rows={2} maxLength={2000} placeholder="Bijoux, lunettes, chapeau, accessoires…"/></label>
        <label>Notes de plateau<textarea name="notes" rows={3} maxLength={4000} placeholder="État exact à reproduire, raccords, remarques…"/></label>
        <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les photos'}</button></div>
      </form></section>}
    <div className="continuity-summary"><div><strong>{visiblePhotos.length}</strong><span> référence(s) affichée(s)</span></div><span><CalendarDays size={14}/> Triées par date, de la plus récente à la plus ancienne</span></div>
    {visiblePhotos.length ? <div className="photo-grid">{visiblePhotos.map(photo => <PhotoCard key={photo.id} photo={photo} sequence={sequences.find(s => s.id === photo.sequenceId)} character={characters.find(c => c.id === photo.characterId)} film={films.find(f => f.id === photo.filmId)} onEdit={() => setEditingPhoto(photo)} onDelete={() => void remove(photo)}/>)}</div> : <div className="workspace-empty"><div className="placeholder-icon"><Search size={25}/></div><h2>{normalized ? 'Aucune référence trouvée' : 'Aucune photo de continuité'}</h2><p>{normalized ? 'Essayez un autre terme de recherche.' : 'Prenez ou importez des photos : elles peuvent rester indépendantes ou être associées à une séquence.'}</p></div>}
    {editingPhoto && <PhotoEditModal photo={editingPhoto} sequences={sequences} characters={characters} films={films} onClose={() => setEditingPhoto(null)} onSaved={async () => { setEditingPhoto(null); await refresh(); onDataChanged(); setNotice('Référence de continuité mise à jour.'); }}/>}
    {cameraOpen && <div className="modal-backdrop camera-backdrop" role="dialog" aria-modal="true" aria-label="Prendre une photo de continuité"><section className="camera-modal"><div className="editor-heading"><div><div className="eyebrow">PRISE DE VUE</div><h2>Photo de continuité</h2></div><button type="button" className="icon-button" aria-label="Fermer la caméra" onClick={closeCamera}><X size={18}/></button></div><div className="camera-preview">{!cameraError && <video ref={videoRef} autoPlay muted playsInline aria-label="Aperçu de la caméra"/>}{cameraError && <div className="camera-fallback"><Camera size={30}/><p>{cameraError}</p><small>Vérifiez l’autorisation caméra et utilisez localhost ou une adresse HTTPS.</small></div>}</div>{cameraError && <div className="form-error">{cameraError}</div>}<div className="camera-footer"><span>{capturedFiles.length} photo(s) en attente</span><button type="button" className="outline-button" onClick={switchCamera} disabled={cameraBusy}><SwitchCamera size={16}/> {cameraFacing === 'environment' ? 'Caméra avant' : 'Caméra arrière'}</button><button type="button" className="outline-button" onClick={closeCamera}>Terminer</button><button type="button" className="primary-button" onClick={() => void capturePhoto()} disabled={cameraBusy || !!cameraError}><Camera size={17}/>{cameraBusy ? 'Capture…' : 'Capturer'}</button></div></section></div>}
  </div>;
}

function PhotoEditModal({ photo, sequences, characters, films, onClose, onSaved }: { photo: PhotoRecord; sequences: SequenceRecord[]; characters: CharacterRecord[]; films: FilmRecord[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const localDate = new Date(photo.capturedAt); const defaultDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { await updatePhoto({ id: photo.id, sequenceId: String(data.get('sequenceId') ?? '') || undefined, capturedAt: String(data.get('capturedAt') ?? ''), hairDetails: String(data.get('hairDetails') ?? ''), makeupDetails: String(data.get('makeupDetails') ?? ''), accessories: String(data.get('accessories') ?? ''), notes: String(data.get('notes') ?? '') }); await onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible.'); } finally { setBusy(false); } }
  return <div className="modal-backdrop"><section className="editor-modal" role="dialog" aria-modal="true"><div className="editor-heading"><div><div className="eyebrow">CONTINUITÉ · RÉFÉRENCE</div><h2>Modifier la photo</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><X size={18}/></button></div>{error && <div className="form-error">{error}</div>}<form className="project-form" onSubmit={submit}><label>Séquence associée<select name="sequenceId" defaultValue={photo.sequenceId ?? ''}><option value="">Aucune — photo indépendante</option>{sequences.map(s => <option value={s.id} key={s.id}>{s.sequenceNumber ? `${s.sequenceNumber} — ` : ''}{s.name} · {characters.find(c => c.id === s.characterId)?.name} · {films.find(f => f.id === s.filmId)?.title}</option>)}</select></label><label>Date et heure<input name="capturedAt" type="datetime-local" defaultValue={defaultDate}/></label><label>Coiffure<textarea name="hairDetails" rows={2} defaultValue={photo.hairDetails?.details ?? ''} maxLength={2000}/></label><label>Maquillage<textarea name="makeupDetails" rows={2} defaultValue={photo.makeupDetails?.details ?? ''} maxLength={2000}/></label><label>Accessoires<textarea name="accessories" rows={2} defaultValue={photo.accessories ?? ''} maxLength={2000}/></label><label>Notes<textarea name="notes" rows={3} defaultValue={photo.notes ?? ''} maxLength={4000}/></label><div className="editor-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></div></form></section></div>;
}

function PhotoCard({ photo, sequence, character, film, onEdit, onDelete }: { photo: PhotoRecord; sequence?: SequenceRecord; character?: CharacterRecord; film?: FilmRecord; onEdit: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(photo.thumbnailBlob ?? photo.imageBlob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [photo.imageBlob, photo.thumbnailBlob]);
  function downloadOriginal() {
    const objectUrl = URL.createObjectURL(photo.imageBlob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `continuite-${new Date(photo.capturedAt).toISOString().replace(/[:.]/g, '-')}.${photo.imageBlob.type.includes('png') ? 'png' : photo.imageBlob.type.includes('webp') ? 'webp' : 'jpg'}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
  return <article className="photo-card"><div className="photo-image-wrap">{url && <img className="photo-image" src={url} alt={`Référence ${sequence?.name ?? ''}`} loading="lazy"/>}<button type="button" className="photo-edit icon-button" title="Modifier la référence" aria-label="Modifier la référence" onClick={onEdit}><Pencil size={16}/></button><button type="button" className="photo-download icon-button" title="Télécharger la photo originale" aria-label="Télécharger la photo originale" onClick={downloadOriginal}><Download size={16}/></button><button type="button" className="photo-delete icon-button danger-button" title="Supprimer la photo" aria-label="Supprimer la photo" onClick={onDelete}><Trash2 size={16}/></button></div><div className="photo-card-body"><div className="photo-date">{new Date(photo.capturedAt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</div><h3>{sequence?.sequenceNumber ? `${sequence.sequenceNumber} — ` : ''}{sequence?.name ?? 'Photo indépendante'}</h3><p className="photo-context">{film?.title ?? 'Sans film'} · {character?.name ?? 'Sans personnage'}</p>{photo.hairDetails?.details && <p><strong>Coiffure :</strong> {photo.hairDetails.details}</p>}{photo.makeupDetails?.details && <p><strong>Maquillage :</strong> {photo.makeupDetails.details}</p>}{photo.accessories && <p><strong>Accessoires :</strong> {photo.accessories}</p>}{photo.notes && <p className="photo-notes">{photo.notes}</p>}</div></article>;
}
