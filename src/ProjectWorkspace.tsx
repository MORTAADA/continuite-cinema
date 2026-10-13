import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ArrowLeft, Clapperboard, Film, Pencil, Plus, Search, Trash2, Users, X, RotateCcw } from 'lucide-react';
import type { FilmRecord, CharacterRecord, SequenceRecord } from './lib/db';
import { getSetting, setSetting } from './lib/db';
import { archiveCharacter, archiveFilm, archiveSequence, deleteCharacter, deleteFilm, deleteSequence, listCharacters, listFilms, listSequences, restoreCharacter, restoreFilm, restoreSequence, saveCharacter, saveFilm, saveSequence } from './lib/projects';
import BackupWorkspace from './BackupWorkspace';
import ContinuityWorkspace from './ContinuityWorkspace';

type Section = 'Films' | 'Personnages' | 'Séquences' | 'Mes photos' | 'Sauvegarde' | 'Paramètres';
type ContinuityAction = 'camera' | 'images' | undefined;
type Props = { section: Section; query: string; onDataChanged: () => void; continuityAction?: ContinuityAction };
type Editor = { kind: 'film' | 'character' | 'sequence'; id?: string } | null;

type FilmBrowser = { filmId: string; characterId?: string } | null;

export default function ProjectWorkspace({ section, query, onDataChanged, continuityAction }: Props) {
  const [films, setFilms] = useState<FilmRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [sequences, setSequences] = useState<SequenceRecord[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [browser, setBrowser] = useState<FilmBrowser>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [activeSequenceId, setActiveSequenceId] = useState<string | null>(null);
  const [sequenceFilmId, setSequenceFilmId] = useState('');
  const [categoryImages, setCategoryImages] = useState<Record<string,string>>({});

  const refresh = async () => {
    const [f, c, s] = await Promise.all([listFilms(), listCharacters(), listSequences()]);
    setFilms(f); setCharacters(c); setSequences(s);
  };
  useEffect(() => { void refresh().catch(() => setError('Impossible de lire la base locale.')); getSetting<Record<string,string>>('categoryImages').then(v => setCategoryImages(v ?? {})).catch(() => undefined); }, [section]);
  useEffect(() => { if (section !== 'Films') { setBrowser(null); setActiveSequenceId(null); } setShowArchived(false); }, [section]);

  const normalizedQuery = query.trim().toLocaleLowerCase('fr');
  const visibleFilms = useMemo(() => films.filter(f => (showArchived ? !!f.archivedAt : !f.archivedAt) && `${f.title} ${f.description ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery)), [films, normalizedQuery, showArchived]);
  const visibleCharacters = useMemo(() => characters.filter(c => (showArchived ? !!c.archivedAt : !c.archivedAt) && `${c.name} ${c.actorName ?? ''} ${films.find(f => f.id === c.filmId)?.title ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery)), [characters, films, normalizedQuery, showArchived]);
  const visibleSequences = useMemo(() => sequences.filter(s => (showArchived ? !!s.archivedAt : !s.archivedAt && (s.characterIds ?? [s.characterId]).some(cid => characters.some(c => c.id === cid && !c.archivedAt)) && !!films.find(f => f.id === s.filmId && !f.archivedAt)) && `${s.name} ${s.sequenceNumber ?? ''} ${films.find(f => f.id === s.filmId)?.title ?? ''} ${(s.characterIds ?? [s.characterId]).map(id => characters.find(c => c.id === id)?.name ?? '').join(' ')}`.toLocaleLowerCase('fr').includes(normalizedQuery)), [sequences, films, characters, normalizedQuery, showArchived]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (editor?.kind === 'film') await saveFilm({ id: editor.id, title: String(data.get('title') ?? ''), description: String(data.get('description') ?? ''), imageDataUrl: await readImage(data.get('image') as File, String(data.get('existingImage') ?? '')) });
      if (editor?.kind === 'character') await saveCharacter({ id: editor.id, filmId: String(data.get('filmId') ?? ''), name: String(data.get('name') ?? ''), actorName: String(data.get('actorName') ?? ''), notes: String(data.get('notes') ?? ''), imageDataUrl: await readImage(data.get('image') as File, String(data.get('existingImage') ?? '')) });
      if (editor?.kind === 'sequence') { const characterIds = data.getAll('characterIds').map(String); await saveSequence({ id: editor.id, characterId: characterIds[0] ?? String(data.get('characterId') ?? ''), characterIds, name: String(data.get('name') ?? ''), sequenceNumber: String(data.get('sequenceNumber') ?? ''), description: String(data.get('description') ?? ''), imageDataUrl: await readImage(data.get('image') as File, String(data.get('existingImage') ?? '')) }); }
      setEditor(null); setNotice('Enregistré sur cet appareil.'); await refresh(); onDataChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Une erreur est survenue.'); }
    finally { setBusy(false); }
  }

  async function archive(kind: 'film' | 'character' | 'sequence', id: string, label: string) {
    if (!window.confirm(`Archiver « ${label} » ? Les données et photos seront conservées et pourront être restaurées.`)) return;
    try { if (kind === 'film') await archiveFilm(id); if (kind === 'character') await archiveCharacter(id); if (kind === 'sequence') await archiveSequence(id); await refresh(); onDataChanged(); setNotice('Élément archivé. Ses données et photos sont conservées.'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'L’archivage a échoué.'); }
  }
  async function restore(kind: 'film' | 'character' | 'sequence', id: string) {
    try { if (kind === 'film') await restoreFilm(id); if (kind === 'character') await restoreCharacter(id); if (kind === 'sequence') await restoreSequence(id); await refresh(); onDataChanged(); setNotice('Élément restauré.'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'La restauration a échoué.'); }
  }
  async function remove(kind: 'film' | 'character' | 'sequence', id: string, label: string) {
    if (!window.confirm(`Supprimer définitivement « ${label} » de cet appareil ? Les données et photos liées seront supprimées. Les fichiers de sauvegarde exportés auparavant ne seront pas supprimés. Cette action est irréversible.`)) return;
    try {
      if (kind === 'film') await deleteFilm(id);
      if (kind === 'character') await deleteCharacter(id);
      if (kind === 'sequence') await deleteSequence(id);
      setBrowser(current => current?.filmId === id ? null : current);
      await refresh(); onDataChanged(); setNotice('Élément supprimé.'); setError('');
    } catch { setError('La suppression a échoué.'); }
  }

  const editorTitle = editor?.kind === 'film' ? (editor.id ? 'Modifier le film' : 'Nouveau film') : editor?.kind === 'character' ? (editor.id ? 'Modifier le personnage' : 'Nouveau personnage') : editor?.kind === 'sequence' ? (editor.id ? 'Modifier la séquence' : 'Nouvelle séquence') : '';
  const film = editor?.kind === 'film' ? films.find(f => f.id === editor.id) : undefined;
  const character = editor?.kind === 'character' ? characters.find(c => c.id === editor.id) : undefined;
  const sequence = editor?.kind === 'sequence' ? sequences.find(s => s.id === editor.id) : undefined;
  const createKind: 'film' | 'character' | 'sequence' = section === 'Films' ? (browser ? (browser.characterId ? 'sequence' : 'character') : 'film') : section === 'Personnages' ? 'character' : 'sequence';
  const canCreate = createKind === 'film' || (createKind === 'character' && films.some(f => !f.archivedAt)) || (createKind === 'sequence' && characters.some(c => !c.archivedAt && (!browser?.filmId || c.filmId === browser.filmId)));
  const createLabel = createKind === 'film' ? 'Nouveau film' : createKind === 'character' ? 'Nouveau personnage' : 'Nouvelle séquence';

  if (section === 'Films' && activeSequenceId) return <ContinuityWorkspace query={query} onDataChanged={onDataChanged} fixedSequenceId={activeSequenceId} onBack={() => setActiveSequenceId(null)} />;
  if (section === 'Mes photos') return <ContinuityWorkspace query={query} onDataChanged={onDataChanged} initialAction={continuityAction} />;
  if (section === 'Sauvegarde') return <BackupWorkspace onDataChanged={onDataChanged} />;

  if (section === 'Paramètres') return <ImageSettings />;

  const selectedFilm = browser ? films.find(item => item.id === browser.filmId) : undefined;
  const selectedCharacter = browser?.characterId ? characters.find(item => item.id === browser.characterId) : undefined;
  const browserCharacters = selectedFilm && !selectedFilm.archivedAt ? characters.filter(item => !item.archivedAt && item.filmId === selectedFilm.id && `${item.name} ${item.actorName ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery)) : [];
  const browserSequences = selectedCharacter ? sequences.filter(item => !item.archivedAt && (item.characterIds ?? [item.characterId]).includes(selectedCharacter.id) && `${item.name} ${item.sequenceNumber ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery)) : [];

  return <div className="workspace-stack">
    <div className="workspace-toolbar">
      <div>
        <div className="eyebrow">GESTION DES PROJETS</div>
        <p>{section === 'Films' ? (browser ? (selectedCharacter ? `Séquences de ${selectedCharacter.name}` : `Personnages de ${selectedFilm?.title ?? 'ce film'}`) : `${films.length} film(s) enregistré(s)`) : section === 'Personnages' ? `${characters.length} personnage(s) enregistré(s)` : `${sequences.length} séquence(s) enregistrée(s)`}</p>
      </div>
      <div className="toolbar-actions">
        {(['Films','Personnages','Séquences'].includes(section) && !(section === 'Films' && browser)) && <button type="button" className="outline-button compact-button" onClick={() => setShowArchived(v => !v)}><Archive size={15}/>{showArchived ? 'Voir les éléments actifs' : 'Voir les archives'}</button>}
        {section === 'Films' && browser && <button type="button" className="outline-button compact-button" onClick={() => setBrowser(browser.characterId ? { filmId: browser.filmId } : null)}><ArrowLeft size={15}/> Retour</button>}
        {canCreate && <button type="button" className="primary-button" onClick={() => { setError(''); if (createKind === 'sequence') setSequenceFilmId(browser?.filmId ?? characters.find(c => !c.archivedAt)?.filmId ?? films.find(f => !f.archivedAt)?.id ?? ''); setEditor({ kind: createKind }); }}><Plus size={17}/>{createLabel}</button>}
      </div>
    </div>
    {notice && <div className="workspace-notice">{notice}</div>}{error && <div className="form-error">{error}</div>}

    {section === 'Films' && !browser && <div className="record-grid">
      {visibleFilms.map(item => <article className="record-card record-card-clickable" key={item.id} onClick={() => setBrowser({ filmId: item.id })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setBrowser({ filmId: item.id }); }} role="button" tabIndex={0}>
        <RecordImage src={item.imageDataUrl ?? categoryImages.films} fallback={<Clapperboard size={20}/>} /><div className="record-main"><h3>{item.title}</h3><p>{item.description || 'Aucune description pour le moment.'}</p><small>{characters.filter(c => c.filmId === item.id).length} personnage(s) · {sequences.filter(s => s.filmId === item.id).length} séquence(s)</small></div>
        <div className="record-actions"><button type="button" className="icon-button" title="Modifier" onClick={e => { e.stopPropagation(); setEditor({kind:'film',id:item.id}); }}><Pencil size={15}/></button>{item.archivedAt ? <><button type="button" className="icon-button" title="Restaurer" onClick={e => { e.stopPropagation(); void restore('film',item.id); }}><RotateCcw size={15}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement" onClick={e => { e.stopPropagation(); void remove('film',item.id,item.title); }}><Trash2 size={15}/></button></> : <button type="button" className="icon-button" title="Archiver" onClick={e => { e.stopPropagation(); void archive('film',item.id,item.title); }}><Archive size={15}/></button>}</div>
      </article>)}
      {visibleFilms.length === 0 && <Empty title={normalizedQuery ? 'Aucun résultat' : 'Votre premier film vous attend'} body={normalizedQuery ? 'Essayez un autre terme de recherche.' : 'Créez un film pour commencer à organiser les personnages, les séquences et les photos de continuité.'}/>}</div>}

    {section === 'Films' && browser && !selectedCharacter && <div className="record-grid">
      {browserCharacters.map(item => <article className="record-card record-card-clickable" key={item.id} onClick={() => setBrowser({ filmId: browser.filmId, characterId: item.id })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setBrowser({ filmId: browser.filmId, characterId: item.id }); }} role="button" tabIndex={0}>
        <RecordImage src={item.imageDataUrl ?? categoryImages.characters} fallback={<Users size={20}/>} /><div className="record-main"><h3>{item.name}</h3><p>{item.actorName ? `Interprété par ${item.actorName}` : 'Acteur non renseigné'}</p><small>{selectedFilm?.title} · {sequences.filter(s => (s.characterIds ?? [s.characterId]).includes(item.id) && !s.archivedAt).length} séquence(s)</small>{item.notes && <p className="record-notes">{item.notes}</p>}</div>
        <div className="record-actions"><button type="button" className="icon-button" title="Modifier" onClick={e => { e.stopPropagation(); setEditor({kind:'character',id:item.id}); }}><Pencil size={15}/></button></div>
      </article>)}
      {browserCharacters.length === 0 && <Empty title="Aucun personnage" body="Ajoutez un personnage à ce film pour continuer vers ses séquences."/>}
    </div>}

    {section === 'Films' && browser && selectedCharacter && <div className="record-grid">
      {browserSequences.map(item => <article className="record-card" key={item.id}><RecordImage src={item.imageDataUrl ?? categoryImages.sequences} fallback={<Film size={20}/>} /><div className="record-main"><h3>{item.sequenceNumber ? `${item.sequenceNumber} — ` : ''}{item.name}</h3><p>{item.description || 'Aucune note pour cette séquence.'}</p><small>{selectedFilm?.title} · {selectedCharacter.name}</small><button type="button" className="text-button open-sequence-button" onClick={() => setActiveSequenceId(item.id)}>Ouvrir les photos et la caméra →</button></div><div className="record-actions"><button type="button" className="icon-button" title="Modifier" onClick={() => { setSequenceFilmId(item.filmId); setEditor({kind:'sequence',id:item.id}); }}><Pencil size={15}/></button>{item.archivedAt ? <><button type="button" className="icon-button" title="Restaurer" onClick={() => void restore('sequence',item.id)}><RotateCcw size={15}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement" onClick={() => void remove('sequence',item.id,item.name)}><Trash2 size={15}/></button></> : <button type="button" className="icon-button" title="Archiver" onClick={() => void archive('sequence',item.id,item.name)}><Archive size={15}/></button>}</div></article>)}
      {browserSequences.length === 0 && <Empty title="Aucune séquence" body="Ajoutez une séquence à ce personnage pour continuer vers les photos de continuité."/>}
    </div>}

    {section === 'Personnages' && <div className="record-grid">{visibleCharacters.map(item => <article className="record-card" key={item.id}><RecordImage src={item.imageDataUrl ?? categoryImages.characters} fallback={<Users size={20}/>} /><div className="record-main"><h3>{item.name}</h3><p>{item.actorName ? `Interprété par ${item.actorName}` : 'Acteur non renseigné'}</p><small>{films.find(f => f.id === item.filmId)?.title ?? 'Film inconnu'} · {sequences.filter(s => (s.characterIds ?? [s.characterId]).includes(item.id) && !s.archivedAt).length} séquence(s)</small>{item.notes && <p className="record-notes">{item.notes}</p>}</div><div className="record-actions"><button type="button" className="icon-button" title="Modifier" onClick={() => setEditor({kind:'character',id:item.id})}><Pencil size={15}/></button>{item.archivedAt ? <><button type="button" className="icon-button" title="Restaurer" onClick={() => void restore('character',item.id)}><RotateCcw size={15}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement" onClick={() => void remove('character',item.id,item.name)}><Trash2 size={15}/></button></> : <button type="button" className="icon-button" title="Archiver" onClick={() => void archive('character',item.id,item.name)}><Archive size={15}/></button>}</div></article>)}{visibleCharacters.length === 0 && <Empty title={films.length ? 'Aucun personnage pour le moment' : 'Créez d’abord un film'} body={films.length ? 'Ajoutez une fiche personnage et associez-la à un film.' : 'Un personnage doit appartenir à un film.'}/>}</div>}

    {section === 'Séquences' && <div className="record-grid">{visibleSequences.map(item => <article className="record-card" key={item.id}><RecordImage src={item.imageDataUrl ?? categoryImages.sequences} fallback={<Film size={20}/>} /><div className="record-main"><h3>{item.sequenceNumber ? `${item.sequenceNumber} — ` : ''}{item.name}</h3><p>{item.description || 'Aucune note pour cette séquence.'}</p><small>{films.find(f => f.id === item.filmId)?.title} · {(item.characterIds ?? [item.characterId]).map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ')}</small></div><div className="record-actions"><button type="button" className="icon-button" title="Modifier" onClick={() => { setSequenceFilmId(item.filmId); setEditor({kind:'sequence',id:item.id}); }}><Pencil size={15}/></button>{item.archivedAt ? <><button type="button" className="icon-button" title="Restaurer" onClick={() => void restore('sequence',item.id)}><RotateCcw size={15}/></button><button type="button" className="icon-button danger-button" title="Supprimer définitivement" onClick={() => void remove('sequence',item.id,item.name)}><Trash2 size={15}/></button></> : <button type="button" className="icon-button" title="Archiver" onClick={() => void archive('sequence',item.id,item.name)}><Archive size={15}/></button>}</div></article>)}{visibleSequences.length === 0 && <Empty title={characters.length ? 'Aucune séquence pour le moment' : 'Ajoutez un personnage'} body={characters.length ? 'Créez une séquence et associez-la à un personnage.' : 'Les séquences sont classées dans le dossier de chaque personnage.'}/>}</div>}

    {editor && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditor(null); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="editor-heading"><div><div className="eyebrow">CONTINUITÉ · DOSSIER</div><h2 id="editor-title">{editorTitle}</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setEditor(null)}><X size={18}/></button></div><form className="project-form" onSubmit={submit}>
      {editor.kind === 'film' && <><ImageField existing={film?.imageDataUrl} /><input type="hidden" name="existingImage" value={film?.imageDataUrl ?? ''}/><label>Titre du film *<input name="title" defaultValue={film?.title ?? ''} required autoFocus maxLength={120} placeholder="Ex. Le dernier été"/></label><label>Description / production<textarea name="description" defaultValue={film?.description ?? ''} rows={3} placeholder="Informations utiles sur le projet…" maxLength={2000}/></label></>}
      {editor.kind === 'character' && <><ImageField existing={character?.imageDataUrl} /><input type="hidden" name="existingImage" value={character?.imageDataUrl ?? ''}/><label>Film associé *<select name="filmId" defaultValue={character?.filmId ?? browser?.filmId ?? films.find(f => !f.archivedAt)?.id ?? ''} required>{films.filter(f => !f.archivedAt || f.id === character?.filmId).map(f => <option value={f.id} key={f.id}>{f.title}</option>)}</select></label><label>Nom du personnage *<input name="name" defaultValue={character?.name ?? ''} required autoFocus maxLength={120} placeholder="Ex. Claire"/></label><label>Nom de l’acteur / actrice<input name="actorName" defaultValue={character?.actorName ?? ''} maxLength={120} placeholder="Nom de l’interprète"/></label><label>Informations complémentaires<textarea name="notes" defaultValue={character?.notes ?? ''} rows={3} maxLength={3000} placeholder="Description physique, repères de continuité…"/></label></>}
      {editor.kind === 'sequence' && <><ImageField existing={sequence?.imageDataUrl} /><input type="hidden" name="existingImage" value={sequence?.imageDataUrl ?? ''}/><label>Film associé *<select name="sequenceFilmId" value={sequence?.filmId ?? sequenceFilmId} onChange={e => setSequenceFilmId(e.target.value)} required disabled={!!sequence}>{films.filter(f => !f.archivedAt).map(f => <option value={f.id} key={f.id}>{f.title}</option>)}</select></label><fieldset className="character-picker"><legend>Personnages associés *</legend><p className="field-hint">Touchez chaque personnage à associer à cette séquence.</p>{characters.filter(c => !c.archivedAt && c.filmId === (sequence?.filmId ?? sequenceFilmId)).map(c => <label className="character-picker-option" key={c.id}><input type="checkbox" name="characterIds" value={c.id} defaultChecked={(sequence?.characterIds ?? [sequence?.characterId ?? browser?.characterId ?? characters.find(x => !x.archivedAt && x.filmId === (sequence?.filmId ?? sequenceFilmId))?.id ?? '']).includes(c.id)}/><span>{c.name}</span></label>)}{!characters.some(c => !c.archivedAt && c.filmId === (sequence?.filmId ?? sequenceFilmId)) && <p className="field-hint">Ajoutez d’abord un personnage à ce film.</p>}</fieldset><label>Nom de la séquence *<input name="name" defaultValue={sequence?.name ?? ''} required autoFocus maxLength={120} placeholder="Ex. Intérieur — Chambre"/></label><label>Numéro de séquence<input name="sequenceNumber" defaultValue={sequence?.sequenceNumber ?? ''} maxLength={40} placeholder="Ex. 12A"/></label><label>Description / repères<textarea name="description" defaultValue={sequence?.description ?? ''} rows={3} maxLength={3000} placeholder="État de la coiffure, maquillage, accessoires…"/></label></>}
      <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setEditor(null)}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form></section></div>}
  </div>;
}
function readImage(file: File | null, existing: string): Promise<string | undefined> {
  if (!file || !file.size) return Promise.resolve(existing || undefined);
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choisissez un fichier image.'));
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('L’image doit faire 2 Mo maximum.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Impossible de lire cette image.')); reader.readAsDataURL(file); });
}
function ImageField({ existing }: { existing?: string }) { return <div className="image-field"><label>Image personnalisée (facultatif)<input name="image" type="file" accept="image/*" /></label>{existing && <div className="image-preview-row"><img src={existing} alt="Image actuelle"/><span>Image actuelle conservée si vous ne choisissez pas une nouvelle image.</span></div>}</div>; }
function RecordImage({ src, fallback }: { src?: string; fallback: ReactNode }) { return <div className="record-icon">{src ? <img className="record-custom-image" src={src} alt=""/> : fallback}</div>; }
function ImageSettings() {
  const [images, setImages] = useState<Record<string,string>>({}); const [message, setMessage] = useState('');
  useEffect(() => { getSetting<Record<string,string>>('categoryImages').then(v => setImages(v ?? {})).catch(() => setMessage('Impossible de charger les images.')); }, []);
  async function choose(key: string, file?: File) { if (!file) return; if (!file.type.startsWith('image/')) { setMessage('Choisissez un fichier image.'); return; } if (file.size > 2*1024*1024) { setMessage('Chaque image doit faire 2 Mo maximum.'); return; } const reader = new FileReader(); reader.onload = async () => { const next = {...images, [key]: String(reader.result)}; try { await setSetting('categoryImages', next); setImages(next); setMessage('Images enregistrées sur cet appareil.'); } catch { setMessage('Enregistrement impossible. Essayez une image plus légère.'); } }; reader.readAsDataURL(file); }
  async function remove(key: string) { const next = {...images}; delete next[key]; await setSetting('categoryImages', next); setImages(next); setMessage('Image supprimée. L’icône d’origine sera utilisée.'); }
  return <div className="workspace-stack"><div className="workspace-toolbar"><div><div className="eyebrow">PERSONNALISATION VISUELLE</div><p>Choisissez les images générales des catégories. Elles sont enregistrées sur cet appareil.</p></div></div><div className="image-settings-grid">{[{key:'films',label:'Films'},{key:'characters',label:'Personnages'},{key:'sequences',label:'Séquences'}].map(item => <section className="content-card image-setting-card" key={item.key}><h3>{item.label}</h3>{images[item.key] ? <img className="category-image-preview" src={images[item.key]} alt={'Image de catégorie '+item.label}/> : <div className="category-image-placeholder">Icône d’origine</div>}<label className="primary-button file-import-button">Choisir une image<input type="file" accept="image/*" onChange={e => void choose(item.key,e.target.files?.[0])}/></label>{images[item.key] && <button className="outline-button" type="button" onClick={() => void remove(item.key)}>Revenir à l’icône</button>}</section>)}</div>{message && <p className="workspace-notice">{message}</p>}<p className="field-hint">Pour les images individuelles, ouvrez un film, un personnage ou une séquence et utilisez le champ « Image personnalisée ». Formats image courants, 2 Mo maximum par image.</p></div>;
}
function Empty({ title, body }: { title: string; body: string }) { return <div className="workspace-empty"><div className="placeholder-icon"><Search size={25}/></div><h2>{title}</h2><p>{body}</p></div>; }
