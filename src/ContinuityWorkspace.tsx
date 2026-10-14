import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Camera, ImagePlus, Trash2, CalendarDays, Search, X, SwitchCamera, Pencil, RotateCcw, Archive } from 'lucide-react';
import type { FilmRecord, CharacterRecord, SequenceRecord, PhotoRecord } from './lib/db';
import { getDatabase } from './lib/db';
import { archivePhoto, deletePhoto, listPhotos, restorePhoto, savePhoto } from './lib/photos';
import PhotoViewer from './PhotoViewer';
import { rememberSequence } from './lib/resume';

type Props = { query: string; onDataChanged: () => void; initialAction?: 'camera' | 'images'; fixedSequenceId?: string; onBack?: () => void; openPhotoId?: string; openPhotoNonce?: number };
type ViewerState = { ids: string[]; id: string; from: 'camera' | 'list'; details: boolean } | null;
const linkedIds = (sequence: SequenceRecord) => (sequence.characterIds?.length ? sequence.characterIds : [sequence.characterId]);

export default function ContinuityWorkspace({ query, onDataChanged, initialAction, fixedSequenceId, onBack, openPhotoId, openPhotoNonce }: Props) {
  const [films, setFilms] = useState<FilmRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [sequences, setSequences] = useState<SequenceRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [sequenceId, setSequenceId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [showArchivedPhotos, setShowArchivedPhotos] = useState(false);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const [cameraToast, setCameraToast] = useState('');
  const [filterFilm, setFilterFilm] = useState('');
  const [filterCharacter, setFilterCharacter] = useState('');
  const [filterSequence, setFilterSequence] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refresh = async () => {
    const db = await getDatabase();
    const [f, c, s, p] = await Promise.all([db.getAll('films'), db.getAll('characters'), db.getAll('sequences'), listPhotos()]);
    setFilms(f); setCharacters(c); setSequences(s); setPhotos(p); setLoaded(true);
    setSequenceId(current => fixedSequenceId && s.some(item => item.id === fixedSequenceId && !item.archivedAt) ? fixedSequenceId : s.some(item => item.id === current && !item.archivedAt) ? current : (s.find(item => !item.archivedAt)?.id ?? ''));
  };
  useEffect(() => { if (fixedSequenceId) void rememberSequence(fixedSequenceId); }, [fixedSequenceId]);
  useEffect(() => { void refresh().catch(() => setError('Impossible de lire les données locales.')); }, [fixedSequenceId]);

  useEffect(() => {
    if (!loaded) return;
    if (initialAction === 'camera') {
      setShowForm(false);
      if (sequences.some(item => !item.archivedAt)) {
        setError(''); setCameraError(''); setCameraOpen(true);
      } else {
        setCameraOpen(false);
        setError('Créez d’abord un film, un personnage et une séquence active avant de photographier.');
      }
    } else if (initialAction === 'images') {
      setShowForm(false);
    }
  }, [initialAction, sequences.length, loaded]);

  // Ouverture directe d'une photo (touche sur une miniature de l'accueil).
  const openedPhotoNonce = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded || !openPhotoId || openedPhotoNonce.current === openPhotoNonce) return;
    const target = photos.find(p => p.id === openPhotoId);
    openedPhotoNonce.current = openPhotoNonce;
    if (target) setViewer({ ids: photos.filter(p => !p.archivedAt).map(p => p.id), id: target.id, from: 'list', details: false });
  }, [loaded, openPhotoId, openPhotoNonce, photos]);

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
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setFlashSupported(!!capabilities?.torch); setFlashEnabled(false);
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

  function closeCamera() { setCameraOpen(false); setViewer(null); setCameraError(''); setFlashEnabled(false); }


  function switchCamera() {
    setCameraError('');
    setCameraFacing(current => current === 'environment' ? 'user' : 'environment');
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || !sequenceId) {
      setCameraError(!sequenceId ? 'Choisissez une séquence avant de photographier.' : 'La caméra n’est pas encore prête.');
      return;
    }
    setCameraBusy(true); setCameraError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Impossible de préparer la photo.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('La photo n’a pas pu être créée.')), 'image/jpeg', 0.98));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `continuite-${stamp}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      // 1) la photo est enregistrée d'abord ; 2) les notes et rattachements se modifient ensuite dans l'aperçu.
      const saved = await savePhoto({ sequenceId, file, capturedAt: new Date().toISOString() });
      setPhotos(list => [saved, ...list]); onDataChanged();
      window.clearTimeout(toastTimer.current); setCameraToast('Photo enregistrée ✓');
      toastTimer.current = window.setTimeout(() => setCameraToast(''), 1600);
    } catch (e) {
      setCameraError(e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Le stockage local semble plein. Exportez une sauvegarde ou libérez de l’espace.'
        : e instanceof Error ? e.message : 'La capture ou la sauvegarde a échoué.');
    } finally { setCameraBusy(false); }
  }

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !flashSupported) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashEnabled } as MediaTrackConstraintSet] });
      setFlashEnabled(value => !value);
    } catch { setCameraError('Le flash est annoncé mais ne peut pas être activé par ce navigateur.'); }
  }


  const normalized = query.trim().toLocaleLowerCase('fr');
  const visiblePhotos = useMemo(() => photos.filter(photo => {
    if (showArchivedPhotos ? !photo.archivedAt : !!photo.archivedAt) return false;
    if (!showArchivedPhotos && (films.find(f => f.id === photo.filmId)?.archivedAt || sequences.find(s => s.id === photo.sequenceId)?.archivedAt)) return false;
    if (fixedSequenceId && photo.sequenceId !== fixedSequenceId) return false;
    if (filterFilm && photo.filmId !== filterFilm) return false;
    if (filterSequence && photo.sequenceId !== filterSequence) return false;
    if (filterCharacter && !(sequences.find(s => s.id === photo.sequenceId) ? linkedIds(sequences.find(s => s.id === photo.sequenceId)!) : [photo.characterId]).includes(filterCharacter)) return false;
    const sequence = sequences.find(s => s.id === photo.sequenceId);
    const character = characters.find(c => c.id === photo.characterId);
    const film = films.find(f => f.id === photo.filmId);
    const haystack = [sequence?.name, sequence?.sequenceNumber, character?.name, character?.actorName, film?.title, photo.accessories, photo.notes, photo.hairDetails?.details, photo.makeupDetails?.details].join(' ').toLocaleLowerCase('fr');
    return haystack.includes(normalized);
  }), [photos, sequences, characters, films, normalized, fixedSequenceId, showArchivedPhotos, filterFilm, filterCharacter, filterSequence]);
  const filterCharacters = useMemo(() => characters.filter(c => !c.archivedAt && (!filterFilm || c.filmId === filterFilm)), [characters, filterFilm]);
  const filterSequences = useMemo(() => sequences.filter(s => !s.archivedAt && (!filterFilm || s.filmId === filterFilm) && (!filterCharacter || linkedIds(s).includes(filterCharacter))), [sequences, filterFilm, filterCharacter]);
  const cameraPhotos = useMemo(() => photos.filter(p => !p.archivedAt && p.sequenceId === sequenceId), [photos, sequenceId]);

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

  const openViewer = (ids: string[], id: string, from: 'camera' | 'list', details = false) => setViewer({ ids, id, from, details });
  const viewerPhoto = viewer ? photos.find(p => p.id === viewer.id) : undefined;
  const viewerIndex = viewer ? viewer.ids.indexOf(viewer.id) : -1;
  const goTo = (offset: number) => setViewer(v => { if (!v) return v; const next = v.ids[v.ids.indexOf(v.id) + offset]; return next ? { ...v, id: next, details: false } : v; });
  function photoDeleted(photoId: string) {
    setPhotos(list => list.filter(p => p.id !== photoId)); onDataChanged();
    setViewer(v => {
      if (!v) return v;
      const index = v.ids.indexOf(photoId); const ids = v.ids.filter(id => id !== photoId);
      if (!ids.length) return null;
      return { ...v, ids, id: ids[Math.min(index, ids.length - 1)], details: false };
    });
    setNotice('Photo supprimée définitivement.'); setError('');
  }

  return <div className="workspace-stack">
    <div className="workspace-toolbar"><div><div className="eyebrow">MES PHOTOS</div><p>{fixedSequenceId ? `Séquence : ${sequences.find(s => s.id === fixedSequenceId)?.name ?? 'séquence'}` : `${photos.filter(p => !p.archivedAt).length} photo(s) active(s) · Coiffure, maquillage et accessoires`}</p></div><div className="toolbar-actions">{onBack && <button type="button" className="outline-button" onClick={onBack}>← Retour aux séquences</button>}<button type="button" className="outline-button" onClick={() => { setShowArchivedPhotos(v => !v); setShowForm(false); }}><Archive size={15}/>{showArchivedPhotos ? 'Voir les photos actives' : 'Voir les photos archivées'}</button>{!showArchivedPhotos && <button type="button" className="primary-button" disabled={!sequences.some(s => !s.archivedAt)} onClick={() => { setShowForm(v => !v); setError(''); }}><ImagePlus size={17}/>{showForm ? 'Fermer' : fixedSequenceId ? 'Ajouter une photo' : 'Ajouter des photos'}</button>}</div></div>
    {!sequences.some(s => !s.archivedAt) && <div className="workspace-empty"><div className="placeholder-icon"><Camera size={26}/></div><h2>Préparez une séquence</h2><p>Pour ajouter des photos de continuité, créez d’abord un film, un personnage puis une séquence.</p></div>}
    {notice && <div className="workspace-notice">{notice}</div>}{error && <div className="form-error">{error}</div>}
    {showForm && !showArchivedPhotos && sequences.some(s => !s.archivedAt) && <section className="content-card continuity-form-card"><div className="editor-heading"><div><div className="eyebrow">NOUVELLE RÉFÉRENCE</div><h2>Ajouter des photos</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setShowForm(false)}><X size={18}/></button></div>
      <form className="project-form" onSubmit={submit}>
        {!fixedSequenceId && <label>Séquence associée *<select value={sequenceId} onChange={e => setSequenceId(e.target.value)} required>{sequences.filter(s => !s.archivedAt).map(s => <option value={s.id} key={s.id}>{s.sequenceNumber ? `${s.sequenceNumber} — ` : ''}{s.name} · {(s.characterIds ?? [s.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ')} · {films.find(f => f.id === s.filmId)?.title}</option>)}</select></label>}
        {fixedSequenceId ? <div className="camera-actions"><button type="button" className="primary-button camera-open-button" onClick={() => { setCameraError(''); setCameraOpen(true); }} disabled={!sequenceId}><Camera size={20}/>Ouvrir la caméra</button><span>Chaque photo sera enregistrée immédiatement, sans interrompre la caméra.</span></div> : <div className="workspace-notice">Pour prendre une photo, ouvrez un film, puis une personnage et une séquence. Ici, vous pouvez importer des images dans une séquence existante.</div>}
        <label>Importer depuis la galerie<input name="photos" type="file" accept="image/*" multiple /></label>
        <div className="field-hint">Images JPG, PNG ou WebP · 25 Mo maximum par image. Les fichiers originaux sont conservés. Après l’enregistrement, ouvrez une photo pour ajouter les notes et la date.</div>
        <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les photos'}</button></div>
      </form></section>}
    {!fixedSequenceId && !showArchivedPhotos && <div className="photo-filters" role="group" aria-label="Classer et filtrer les photos"><label>Film<select value={filterFilm} onChange={e => { setFilterFilm(e.target.value); setFilterCharacter(''); setFilterSequence(''); }}><option value="">Tous les films</option>{films.filter(f => !f.archivedAt).map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label><label>Personnage<select value={filterCharacter} onChange={e => { setFilterCharacter(e.target.value); setFilterSequence(''); }}><option value="">Tous les personnages</option>{filterCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Séquence<select value={filterSequence} onChange={e => setFilterSequence(e.target.value)}><option value="">Toutes les séquences</option>{filterSequences.map(sq => <option key={sq.id} value={sq.id}>{sq.sequenceNumber ? `${sq.sequenceNumber} — ` : ''}{sq.name}</option>)}</select></label>{(filterFilm || filterCharacter || filterSequence) && <button type="button" className="outline-button compact-button" onClick={() => { setFilterFilm(''); setFilterCharacter(''); setFilterSequence(''); }}>Réinitialiser</button>}</div>}
    <div className="continuity-summary"><div><strong>{visiblePhotos.length}</strong><span> référence(s) affichée(s)</span></div><span><CalendarDays size={14}/> Triées par date, de la plus récente à la plus ancienne</span></div>
    {visiblePhotos.length ? <div className="photo-grid">{visiblePhotos.map(photo => <PhotoCard key={photo.id} photo={photo} sequence={sequences.find(s => s.id === photo.sequenceId)} characterLabel={(sequences.find(s => s.id === photo.sequenceId)?.characterIds ?? [photo.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ')} film={films.find(f => f.id === photo.filmId)} isArchived={!!photo.archivedAt} onArchive={() => void archiveOnePhoto(photo)} onRestore={() => void restoreOnePhoto(photo)} onDelete={() => void remove(photo)} onOpen={() => openViewer(visiblePhotos.map(p => p.id), photo.id, 'list')} onEdit={() => openViewer(visiblePhotos.map(p => p.id), photo.id, 'list', true)}/>)}</div> : <div className="workspace-empty"><div className="placeholder-icon"><Search size={25}/></div><h2>{normalized ? 'Aucune référence trouvée' : 'Aucune photo de continuité'}</h2><p>{normalized ? 'Essayez un autre terme de recherche.' : 'Ajoutez une ou plusieurs photos à une séquence pour conserver les détails de coiffure, maquillage et accessoires.'}</p></div>}
    {cameraOpen && <div className="modal-backdrop camera-backdrop" role="dialog" aria-modal="true" aria-label="Prendre une photo de continuité"><section className="camera-modal camera-modal-live">
      <div className="camera-topbar"><div><div className="eyebrow">PRISE DE VUE · {cameraPhotos.length} PHOTO(S)</div><h2>{sequences.find(s => s.id === sequenceId)?.name ?? 'Photo de continuité'}</h2></div><button type="button" className="icon-button" aria-label="Fermer la caméra" onClick={closeCamera}><X size={20}/></button></div>
      {!fixedSequenceId && <label className="camera-sequence-select">Séquence associée<select value={sequenceId} onChange={e => setSequenceId(e.target.value)}>{sequences.filter(s => !s.archivedAt).map(item => <option value={item.id} key={item.id}>{item.sequenceNumber ? `${item.sequenceNumber} — ` : ''}{item.name} · {films.find(f => f.id === item.filmId)?.title}</option>)}</select></label>}
      <div className="camera-preview camera-preview-live"><video ref={videoRef} autoPlay muted playsInline aria-label="Aperçu de la caméra"/>{cameraError && <div className="camera-fallback"><Camera size={30}/><p>{cameraError}</p><small>Vérifiez l’autorisation caméra et utilisez localhost ou une adresse HTTPS.</small></div>}{cameraToast && <div className="camera-toast" role="status">{cameraToast}</div>}</div>
      {cameraError && <div className="form-error camera-inline-error">{cameraError}</div>}
      <div className="camera-footer-live">
        <div className="camera-zone camera-zone-left">{cameraPhotos[0] ? <LastShotThumbnail photo={cameraPhotos[0]} count={cameraPhotos.length} onClick={() => openViewer(cameraPhotos.map(p => p.id), cameraPhotos[0].id, 'camera')}/> : <span className="camera-thumb-empty" aria-hidden="true"/>}</div>
        <button type="button" className="camera-shutter-live" onClick={() => void capturePhoto()} disabled={cameraBusy || !!cameraError || !sequenceId} aria-label="Prendre et enregistrer une photo"><span>{cameraBusy ? '…' : ''}</span></button>
        <div className="camera-zone camera-zone-right"><button type="button" className="outline-button camera-side-control" onClick={switchCamera} disabled={cameraBusy || !!cameraError}><SwitchCamera size={20}/><span>{cameraFacing === 'environment' ? 'Avant' : 'Arrière'}</span></button>
        {flashSupported && <button type="button" className={`outline-button camera-side-control ${flashEnabled ? 'flash-active' : ''}`} onClick={() => void toggleFlash()} disabled={cameraBusy}><span>{flashEnabled ? '⚡ Activé' : '⚡ Flash'}</span></button>}
        <button type="button" className="outline-button camera-side-control" onClick={closeCamera}><X size={19}/><span>Fermer</span></button></div></div>
    </section></div>}
    {viewer && viewerPhoto && <PhotoViewer key={viewerPhoto.id} photo={viewerPhoto} films={films} characters={characters} sequences={sequences}
      position={viewerIndex + 1} total={viewer.ids.length} startWithDetails={viewer.details}
      backLabel={viewer.from === 'camera' ? 'Retour à la caméra' : 'Retour'}
      onBack={() => setViewer(null)} onPrev={viewerIndex > 0 ? () => goTo(-1) : undefined} onNext={viewerIndex < viewer.ids.length - 1 ? () => goTo(1) : undefined}
      onSaved={updated => setPhotos(list => list.map(p => p.id === updated.id ? updated : p))} onDeleted={photoDeleted}/>}
  </div>;
}

function LastShotThumbnail({ photo, count, onClick }: { photo: PhotoRecord; count: number; onClick: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(photo.thumbnailBlob ?? photo.imageBlob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [photo.imageBlob, photo.thumbnailBlob]);
  return <button type="button" className="camera-last-shot" onClick={onClick} aria-label={`Afficher la dernière photo en plein écran (${count} photo(s) dans cette séquence)`}>{url && <img src={url} alt=""/>}<span className="camera-last-count">{count}</span></button>;
}

function PhotoCard({ photo, sequence, characterLabel, film, isArchived, onArchive, onRestore, onDelete, onEdit, onOpen }: { photo: PhotoRecord; sequence?: SequenceRecord; characterLabel: string; film?: FilmRecord; isArchived: boolean; onArchive: () => void; onRestore: () => void; onDelete: () => void; onEdit: () => void; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  // La liste utilise la miniature (rapide) ; l'image originale s'ouvre en plein écran.
  useEffect(() => { const objectUrl = URL.createObjectURL(photo.thumbnailBlob ?? photo.imageBlob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [photo.imageBlob, photo.thumbnailBlob]);
  return <article className="photo-card"><div className="photo-image-wrap">{isArchived && <span className="photo-archived-label">ARCHIVÉE</span>}{url && <button type="button" className="photo-open" onClick={onOpen} aria-label={`Ouvrir la photo en plein écran — ${sequence?.name ?? ''}`}><img className="photo-image" src={url} alt={`Référence ${sequence?.name ?? ''}`} loading="lazy"/></button>}<div className="photo-actions">{!isArchived && <><button type="button" className="icon-button" title="Modifier les détails" aria-label="Modifier les détails" onClick={onEdit}><Pencil size={16}/></button><button type="button" className="icon-button" title="Archiver la photo" aria-label="Archiver la photo" onClick={onArchive}><Archive size={16}/></button></>}{isArchived && <><button type="button" className="icon-button" title="Restaurer la photo" aria-label="Restaurer la photo" onClick={onRestore}><RotateCcw size={16}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement la photo" aria-label="Supprimer la photo" onClick={onDelete}><Trash2 size={16}/></button></>}</div></div><div className="photo-card-body"><div className="photo-date">{new Date(photo.capturedAt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</div><h3>{sequence?.sequenceNumber ? `${sequence.sequenceNumber} — ` : ''}{sequence?.name ?? 'Séquence inconnue'}</h3><p className="photo-context">{film?.title ?? 'Film'} · {characterLabel || 'Personnage'}</p>{photo.hairDetails?.details && <p><strong>Coiffure :</strong> {photo.hairDetails.details}</p>}{photo.makeupDetails?.details && <p><strong>Maquillage :</strong> {photo.makeupDetails.details}</p>}{photo.accessories && <p><strong>Accessoires :</strong> {photo.accessories}</p>}{photo.notes && <p className="photo-notes">{photo.notes}</p>}</div></article>;
}
