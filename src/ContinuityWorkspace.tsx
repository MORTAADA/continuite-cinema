import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, ImagePlus, Trash2, CalendarDays, Search, X, SwitchCamera, Pencil, Check, RotateCcw, Archive } from 'lucide-react';
import type { FilmRecord, CharacterRecord, SequenceRecord, PhotoRecord } from './lib/db';
import { getDatabase } from './lib/db';
import { archivePhoto, deletePhoto, listPhotos, restorePhoto, savePhoto, updatePhoto } from './lib/photos';

type Props = { query: string; onDataChanged: () => void; initialAction?: 'camera' | 'images'; fixedSequenceId?: string; onBack?: () => void };
const toLocalDateTimeInput = (iso: string) => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

export default function ContinuityWorkspace({ query, onDataChanged, initialAction, fixedSequenceId, onBack }: Props) {
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
  const [cameraSession, setCameraSession] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const [pendingCapture, setPendingCapture] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('');
  const [editingPhoto, setEditingPhoto] = useState<PhotoRecord | null>(null);
  const [showArchivedPhotos, setShowArchivedPhotos] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refresh = async () => {
    const db = await getDatabase();
    const [f, c, s, p] = await Promise.all([db.getAll('films'), db.getAll('characters'), db.getAll('sequences'), listPhotos()]);
    setFilms(f); setCharacters(c); setSequences(s); setPhotos(p);
    setSequenceId(current => fixedSequenceId && s.some(item => item.id === fixedSequenceId && !item.archivedAt) ? fixedSequenceId : s.some(item => item.id === current && !item.archivedAt) ? current : (s.find(item => !item.archivedAt)?.id ?? ''));
  };
  useEffect(() => { void refresh().catch(() => setError('Impossible de lire les données locales.')); }, [fixedSequenceId]);

  useEffect(() => {
    if (initialAction === 'camera') {
      setShowForm(true); setCameraOpen(false); setPendingCapture(null);
      setError(sequences.some(s => !s.archivedAt) ? 'Ouvrez un film, puis un personnage et une séquence pour prendre une photo.' : 'Créez d’abord un film, un personnage et une séquence active.');
    } else if (initialAction === 'images') {
      setShowForm(false);
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
  }, [cameraOpen, cameraFacing, cameraSession]);

  function closeCamera() { setCameraOpen(false); setPendingCapture(null); setCameraError(''); }

  useEffect(() => {
    if (!pendingCapture) { setPendingPreviewUrl(''); return; }
    const url = URL.createObjectURL(pendingCapture); setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingCapture]);

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
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      setPendingCapture(new File([blob], `continuite-${stamp}.png`, { type: 'image/png', lastModified: Date.now() }));
      setNotice('Vérifiez la photo, puis enregistrez-la ou reprenez-la.');
    } catch (e) { setCameraError(e instanceof Error ? e.message : 'La capture a échoué.'); }
    finally { setCameraBusy(false); }
  }

  async function savePendingCapture() {
    if (!pendingCapture || !sequenceId) { setCameraError('Choisissez d’abord une séquence existante.'); return; }
    setCameraBusy(true); setError(''); setCameraError('');
    try { await savePhoto({ sequenceId, file: pendingCapture }); setPendingCapture(null); setCameraOpen(false); setShowForm(false); setNotice('Photo originale enregistrée sur cet appareil. Vous pourrez ajouter les notes en ouvrant la photo.'); await refresh(); onDataChanged(); }
    catch (e) { setCameraError(e instanceof DOMException && e.name === 'QuotaExceededError' ? 'Le stockage local semble plein. Aucune suppression automatique ne sera effectuée. Exportez une sauvegarde ou libérez de l’espace.' : e instanceof Error ? e.message : 'La sauvegarde a échoué.'); }
    finally { setCameraBusy(false); }
  }

  async function savePhotoDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingPhoto) return; const data = new FormData(event.currentTarget);
    try { await updatePhoto(editingPhoto.id, { capturedAt: String(data.get('capturedAt') ?? ''), hairDetails: String(data.get('hairDetails') ?? ''), makeupDetails: String(data.get('makeupDetails') ?? ''), accessories: String(data.get('accessories') ?? ''), notes: String(data.get('notes') ?? '') }); setEditingPhoto(null); await refresh(); onDataChanged(); setNotice('Informations de la photo mises à jour.'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Impossible de modifier cette photo.'); }
  }

  const normalized = query.trim().toLocaleLowerCase('fr');
  const visiblePhotos = useMemo(() => photos.filter(photo => {
    if (showArchivedPhotos ? !photo.archivedAt : !!photo.archivedAt) return false;
    if (!showArchivedPhotos && (films.find(f => f.id === photo.filmId)?.archivedAt || sequences.find(s => s.id === photo.sequenceId)?.archivedAt)) return false;
    if (fixedSequenceId && photo.sequenceId !== fixedSequenceId) return false;
    const sequence = sequences.find(s => s.id === photo.sequenceId);
    const character = characters.find(c => c.id === photo.characterId);
    const film = films.find(f => f.id === photo.filmId);
    const haystack = [sequence?.name, sequence?.sequenceNumber, character?.name, character?.actorName, film?.title, photo.accessories, photo.notes, photo.hairDetails?.details, photo.makeupDetails?.details].join(' ').toLocaleLowerCase('fr');
    return haystack.includes(normalized);
  }), [photos, sequences, characters, films, normalized, fixedSequenceId, showArchivedPhotos]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const form = event.currentTarget; const data = new FormData(form);
    const files = data.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
    if (!sequenceId) { setError('Choisissez une séquence existante.'); return; }
    if (!files.length) { setError('Choisissez au moins une image dans la galerie.'); return; }
    setBusy(true);
    try {
      let saved = 0;
      for (const file of files) { await savePhoto({ sequenceId, file }); saved++; }
      form.reset(); setShowForm(false); setNotice(`${saved} photo(s) enregistrée(s). Ouvrez une photo pour ajouter ses notes et sa date de référence.`); await refresh(); onDataChanged();
    } catch (e) { setError(e instanceof DOMException && e.name === 'QuotaExceededError' ? 'Le stockage local semble plein. Les photos déjà enregistrées restent conservées; aucune photo ne sera supprimée automatiquement.' : e instanceof Error ? `${e.message} Les photos déjà enregistrées restent conservées.` : 'Enregistrement impossible. Les photos déjà enregistrées restent conservées.'); await refresh(); }
    finally { setBusy(false); }
  }

  async function archiveOnePhoto(photo: PhotoRecord) {
    if (!window.confirm('Archiver cette photo ? Elle sera masquée, mais son image originale restera conservée.')) return;
    try { await archivePhoto(photo.id); await refresh(); onDataChanged(); setNotice('Photo archivée.'); setError(''); } catch { setError('L’archivage de la photo a échoué.'); }
  }
  async function restoreOnePhoto(photo: PhotoRecord) {
    try { await restorePhoto(photo.id); await refresh(); onDataChanged(); setNotice('Photo restaurée.'); setError(''); } catch { setError('La restauration de la photo a échoué.'); }
  }
  async function remove(photo: PhotoRecord) {
    if (!window.confirm('Supprimer définitivement cette photo de cet appareil ? Les copies de sauvegarde exportées auparavant ne seront pas supprimées.')) return;
    try { await deletePhoto(photo.id); await refresh(); onDataChanged(); setNotice('Photo supprimée définitivement.'); setError(''); }
    catch { setError('La suppression a échoué.'); }
  }

  return <div className="workspace-stack">
    <div className="workspace-toolbar"><div><div className="eyebrow">RÉFÉRENCES DE PLATEAU</div><p>{fixedSequenceId ? `Séquence : ${sequences.find(s => s.id === fixedSequenceId)?.name ?? 'séquence'}` : `${photos.filter(p => !p.archivedAt).length} photo(s) active(s) · Coiffure, maquillage et accessoires`}</p></div><div className="toolbar-actions">{onBack && <button type="button" className="outline-button" onClick={onBack}>← Retour aux séquences</button>}<button type="button" className="outline-button" onClick={() => { setShowArchivedPhotos(v => !v); setShowForm(false); }}><Archive size={15}/>{showArchivedPhotos ? 'Voir les photos actives' : 'Voir les photos archivées'}</button>{!showArchivedPhotos && <button type="button" className="primary-button" disabled={!sequences.some(s => !s.archivedAt)} onClick={() => { setShowForm(v => !v); setError(''); }}><ImagePlus size={17}/>{showForm ? 'Fermer' : fixedSequenceId ? 'Ajouter une photo' : 'Ajouter des photos'}</button>}</div></div>
    {!sequences.some(s => !s.archivedAt) && <div className="workspace-empty"><div className="placeholder-icon"><Camera size={26}/></div><h2>Préparez une séquence</h2><p>Pour ajouter des photos de continuité, créez d’abord un film, un personnage puis une séquence.</p></div>}
    {notice && <div className="workspace-notice">{notice}</div>}{error && <div className="form-error">{error}</div>}
    {showForm && !showArchivedPhotos && sequences.some(s => !s.archivedAt) && <section className="content-card continuity-form-card"><div className="editor-heading"><div><div className="eyebrow">NOUVELLE RÉFÉRENCE</div><h2>Ajouter des photos</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setShowForm(false)}><X size={18}/></button></div>
      <form className="project-form" onSubmit={submit}>
        {!fixedSequenceId && <label>Séquence associée *<select value={sequenceId} onChange={e => setSequenceId(e.target.value)} required>{sequences.filter(s => !s.archivedAt).map(s => <option value={s.id} key={s.id}>{s.sequenceNumber ? `${s.sequenceNumber} — ` : ''}{s.name} · {(s.characterIds ?? [s.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ')} · {films.find(f => f.id === s.filmId)?.title}</option>)}</select></label>}
        {fixedSequenceId ? <div className="camera-actions"><button type="button" className="primary-button camera-open-button" onClick={() => { setCameraError(''); setPendingCapture(null); setCameraOpen(true); }} disabled={!sequenceId}><Camera size={20}/>Ouvrir la caméra</button><span>La photo sera enregistrée immédiatement après validation.</span></div> : <div className="workspace-notice">Pour prendre une photo, ouvrez un film, puis une personnage et une séquence. Ici, vous pouvez importer des images dans une séquence existante.</div>}
        <label>Importer depuis la galerie<input name="photos" type="file" accept="image/*" multiple /></label>
        <div className="field-hint">Images JPG, PNG ou WebP · 25 Mo maximum par image. Les fichiers originaux sont conservés. Après l’enregistrement, ouvrez une photo pour ajouter les notes et la date.</div>
        <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les photos'}</button></div>
      </form></section>}
    <div className="continuity-summary"><div><strong>{visiblePhotos.length}</strong><span> référence(s) affichée(s)</span></div><span><CalendarDays size={14}/> Triées par date, de la plus récente à la plus ancienne</span></div>
    {visiblePhotos.length ? <div className="photo-grid">{visiblePhotos.map(photo => <PhotoCard key={photo.id} photo={photo} sequence={sequences.find(s => s.id === photo.sequenceId)} characterLabel={(sequences.find(s => s.id === photo.sequenceId)?.characterIds ?? [photo.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ')} film={films.find(f => f.id === photo.filmId)} isArchived={!!photo.archivedAt} onArchive={() => void archiveOnePhoto(photo)} onRestore={() => void restoreOnePhoto(photo)} onDelete={() => void remove(photo)} onEdit={() => setEditingPhoto(photo)}/>)}</div> : <div className="workspace-empty"><div className="placeholder-icon"><Search size={25}/></div><h2>{normalized ? 'Aucune référence trouvée' : 'Aucune photo de continuité'}</h2><p>{normalized ? 'Essayez un autre terme de recherche.' : 'Ajoutez une ou plusieurs photos à une séquence pour conserver les détails de coiffure, maquillage et accessoires.'}</p></div>}
    {editingPhoto && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditingPhoto(null); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="photo-details-title"><div className="editor-heading"><div><div className="eyebrow">RÉFÉRENCE ENREGISTRÉE</div><h2 id="photo-details-title">Détails de la photo</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setEditingPhoto(null)}><X size={18}/></button></div><form className="project-form" onSubmit={savePhotoDetails}><label>Date et heure de référence<input name="capturedAt" type="datetime-local" defaultValue={toLocalDateTimeInput(editingPhoto.capturedAt)} required/></label><div className="continuity-fields"><label>Coiffure<textarea name="hairDetails" rows={2} defaultValue={editingPhoto.hairDetails?.details ?? ''} maxLength={2000}/></label><label>Maquillage<textarea name="makeupDetails" rows={2} defaultValue={editingPhoto.makeupDetails?.details ?? ''} maxLength={2000}/></label></div><label>Accessoires<textarea name="accessories" rows={2} defaultValue={editingPhoto.accessories ?? ''} maxLength={2000}/></label><label>Notes de plateau<textarea name="notes" rows={3} defaultValue={editingPhoto.notes ?? ''} maxLength={4000}/></label><div className="editor-actions"><button type="button" className="outline-button" onClick={() => setEditingPhoto(null)}>Annuler</button><button type="submit" className="primary-button"><Check size={16}/>Enregistrer les détails</button></div></form></section></div>}
    {cameraOpen && <div className="modal-backdrop camera-backdrop" role="dialog" aria-modal="true" aria-label="Prendre une photo de continuité"><section className="camera-modal"><div className="editor-heading"><div><div className="eyebrow">PRISE DE VUE</div><h2>Photo de continuité</h2></div><button type="button" className="icon-button" aria-label="Fermer la caméra" onClick={closeCamera}><X size={18}/></button></div><div className="camera-preview">{pendingCapture && pendingPreviewUrl ? <img className="pending-camera-image" src={pendingPreviewUrl} alt="Photo capturée à vérifier"/> : !cameraError && <video ref={videoRef} autoPlay muted playsInline aria-label="Aperçu de la caméra"/>}{cameraError && <div className="camera-fallback"><Camera size={30}/><p>{cameraError}</p><small>Vérifiez l’autorisation caméra et utilisez localhost ou une adresse HTTPS.</small></div>}</div>{cameraError && <div className="form-error">{cameraError}</div>}<div className="camera-footer">{pendingCapture ? <><button type="button" className="outline-button" onClick={() => { setPendingCapture(null); setCameraError(''); setCameraSession(v => v + 1); }} disabled={cameraBusy}><RotateCcw size={17}/>Reprendre</button><button type="button" className="outline-button" onClick={closeCamera} disabled={cameraBusy}>Annuler</button><button type="button" className="primary-button camera-save-button" onClick={() => void savePendingCapture()} disabled={cameraBusy}><Check size={20}/>{cameraBusy ? 'Enregistrement…' : 'Enregistrer la photo'}</button></> : <><button type="button" className="outline-button" onClick={switchCamera} disabled={cameraBusy || !!cameraError}><SwitchCamera size={16}/> {cameraFacing === 'environment' ? 'Caméra avant' : 'Caméra arrière'}</button><button type="button" className="outline-button" onClick={closeCamera}>Annuler</button><button type="button" className="primary-button camera-shutter" onClick={() => void capturePhoto()} disabled={cameraBusy || !!cameraError}><Camera size={25}/>{cameraBusy ? 'Capture…' : 'Capturer'}</button></>}</div></section></div>}
  </div>;
}

function PhotoCard({ photo, sequence, characterLabel, film, isArchived, onArchive, onRestore, onDelete, onEdit }: { photo: PhotoRecord; sequence?: SequenceRecord; characterLabel: string; film?: FilmRecord; isArchived: boolean; onArchive: () => void; onRestore: () => void; onDelete: () => void; onEdit: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(photo.imageBlob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [photo.imageBlob]);
  return <article className="photo-card"><div className="photo-image-wrap">{isArchived && <span className="photo-archived-label">ARCHIVÉE</span>}{url && <img className="photo-image" src={url} alt={`Référence ${sequence?.name ?? ''}`} loading="lazy"/>}<div className="photo-actions">{!isArchived && <><button type="button" className="icon-button" title="Modifier les détails" aria-label="Modifier les détails" onClick={onEdit}><Pencil size={16}/></button><button type="button" className="icon-button" title="Archiver la photo" aria-label="Archiver la photo" onClick={onArchive}><Archive size={16}/></button></>}{isArchived && <><button type="button" className="icon-button" title="Restaurer la photo" aria-label="Restaurer la photo" onClick={onRestore}><RotateCcw size={16}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement la photo" aria-label="Supprimer la photo" onClick={onDelete}><Trash2 size={16}/></button></>}</div></div><div className="photo-card-body"><div className="photo-date">{new Date(photo.capturedAt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</div><h3>{sequence?.sequenceNumber ? `${sequence.sequenceNumber} — ` : ''}{sequence?.name ?? 'Séquence inconnue'}</h3><p className="photo-context">{film?.title ?? 'Film'} · {characterLabel || 'Personnage'}</p>{photo.hairDetails?.details && <p><strong>Coiffure :</strong> {photo.hairDetails.details}</p>}{photo.makeupDetails?.details && <p><strong>Maquillage :</strong> {photo.makeupDetails.details}</p>}{photo.accessories && <p><strong>Accessoires :</strong> {photo.accessories}</p>}{photo.notes && <p className="photo-notes">{photo.notes}</p>}</div></article>;
}
