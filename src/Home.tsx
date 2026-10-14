import { useEffect, useState, type FormEvent } from 'react';
import { Camera, ChevronRight, Clapperboard, HardDrive, Image, X } from 'lucide-react';
import type { CharacterRecord, FilmRecord, PhotoRecord, SequenceRecord } from './lib/db';
import { getHomeData, type HomeData } from './lib/home';
import { listCharacters, listFilms, listSequences, saveCharacter, saveFilm, saveSequence } from './lib/projects';

type Target = 'Projets' | 'Mes photos' | 'Sauvegarde';
type Props = {
  onStartCamera: (sequenceId: string) => void;
  onOpenSection: (section: Target) => void;
  onOpenPhoto: (photoId: string) => void;
  onDataChanged: () => void;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function Home({ onStartCamera, onOpenSection, onOpenPhoto, onDataChanged }: Props) {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  useEffect(() => { let alive = true; getHomeData().then(d => { if (alive) setData(d); }).catch(() => { if (alive) setError('Impossible de lire les données locales.'); }); return () => { alive = false; }; }, []);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <div className="home-loading">Chargement…</div>;
  if (data.films === 0) return <Onboarding onDone={sequenceId => { onDataChanged(); onStartCamera(sequenceId); }} />;

  const shoot = () => { if (data.last) onStartCamera(data.last.sequenceId); else if (data.sequences > 0) setPicker(true); else onOpenSection('Projets'); };
  const backupAge = data.lastBackupAt ? daysSince(data.lastBackupAt) : undefined;
  const backupWarn = backupAge === undefined || backupAge >= 7;
  const backupText = backupAge === undefined ? 'Aucune copie pour le moment' : backupAge === 0 ? 'Dernière copie : aujourd’hui' : `Dernière copie : il y a ${plural(backupAge, 'jour')}`;

  return <div className="home">
    <section className="home-resume" aria-label="Reprendre">
      <div className="home-resume-info">
        <div className="home-kicker">{data.last ? 'REPRENDRE LÀ OÙ VOUS ÉTIEZ' : 'PRÊT À PHOTOGRAPHIER'}</div>
        {data.last
          ? <><h2>{data.last.sequenceNumber ? `${data.last.sequenceNumber} — ` : ''}{data.last.sequenceName}</h2><p>{data.last.filmTitle} · {data.last.characters} · {plural(data.last.photoCount, 'photo')}</p>
              {data.sequences > 1 && <button type="button" className="text-button home-change" onClick={() => setPicker(true)}>Changer de séquence</button>}</>
          : <p>{data.sequences > 0 ? 'Choisissez une séquence pour ouvrir la caméra.' : 'Créez une séquence dans Projets pour commencer.'}</p>}
      </div>
      <button type="button" className="home-shoot" onClick={shoot}><Camera size={26}/><span>Photographier</span><small>{data.last ? 'Ouvre la caméra directement' : 'Ouvrir la caméra'}</small></button>
    </section>

    <div className="home-buttons">
      <button type="button" className="home-button" onClick={() => onOpenSection('Projets')}><span className="home-button-icon"><Clapperboard size={22}/></span><span className="home-button-text"><strong>Projets</strong><small>{plural(data.films, 'film')} · {plural(data.sequences, 'séquence')}</small></span><ChevronRight size={20}/></button>
      <button type="button" className="home-button" onClick={() => onOpenSection('Mes photos')}><span className="home-button-icon"><Image size={22}/></span><span className="home-button-text"><strong>Mes photos</strong><small>{plural(data.photos, 'photo')}{data.photosToday ? ` · ${data.photosToday} aujourd’hui` : ''}</small></span><ChevronRight size={20}/></button>
      <button type="button" className={`home-button ${backupWarn ? 'is-warning' : ''}`} onClick={() => onOpenSection('Sauvegarde')}><span className="home-button-icon"><HardDrive size={22}/></span><span className="home-button-text"><strong>Sauvegarde</strong><small>{backupText}</small></span><ChevronRight size={20}/></button>
    </div>

    {data.recent.length > 0 && <section className="home-recent" aria-label="Dernières photos">
      <div className="home-recent-head"><h3>Dernières photos</h3><button type="button" className="text-button" onClick={() => onOpenSection('Mes photos')}>Tout voir →</button></div>
      <div className="home-thumbs">{data.recent.map(photo => <RecentThumb key={photo.id} photo={photo} onClick={() => onOpenPhoto(photo.id)}/>)}</div>
    </section>}
    {picker && <SequencePicker onClose={() => setPicker(false)} onPick={id => { setPicker(false); onStartCamera(id); }}/>}
  </div>;
}

function RecentThumb({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(photo.thumbnailBlob ?? photo.imageBlob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [photo.imageBlob, photo.thumbnailBlob]);
  return <button type="button" className="home-thumb" onClick={onClick} aria-label={`Ouvrir la photo du ${new Date(photo.capturedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`}>{url && <img src={url} alt=""/>}</button>;
}

function Onboarding({ onDone }: { onDone: (sequenceId: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const filmId = await saveFilm({ title: String(data.get('film') ?? '') });
      const characterId = await saveCharacter({ filmId, name: String(data.get('character') ?? '') });
      const sequenceId = await saveSequence({ characterId, characterIds: [characterId], name: String(data.get('sequence') ?? '') });
      onDone(sequenceId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible.'); setBusy(false); }
  }
  return <div className="home home-onboarding"><section className="onboarding-card">
    <div className="home-kicker">BIENVENUE</div>
    <h2>Commençons.</h2>
    <p className="home-muted">Une seule étape pour préparer votre première photo.</p>
    <form className="project-form" onSubmit={submit}>
      <label>Film<input name="film" required maxLength={120} placeholder="Ex. Le dernier été" autoFocus/></label>
      <label>Personnage<input name="character" required maxLength={120} placeholder="Ex. Claire"/></label>
      <label>Séquence<input name="sequence" required maxLength={120} placeholder="Ex. Intérieur — Chambre"/></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="home-shoot onboarding-submit" disabled={busy}><Camera size={22}/><span>{busy ? 'Préparation…' : 'Commencer à photographier'}</span></button>
      <div className="field-hint">Crée le film, le personnage et la séquence, puis ouvre la caméra. Vous pourrez tout compléter plus tard dans Projets.</div>
    </form>
  </section></div>;
}

function SequencePicker({ onClose, onPick }: { onClose: () => void; onPick: (sequenceId: string) => void }) {
  const [rows, setRows] = useState<{ sequence: SequenceRecord; film?: FilmRecord; characters: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([listFilms(false), listCharacters(false), listSequences(false)]).then(([films, characters, sequences]) => {
      if (!alive) return;
      setRows(sequences.filter(s => films.some(f => f.id === s.filmId)).map(sequence => ({
        sequence, film: films.find(f => f.id === sequence.filmId),
        characters: (sequence.characterIds ?? [sequence.characterId]).map(id => characters.find((c: CharacterRecord) => c.id === id)?.name).filter(Boolean).join(', '),
      })));
    }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div className="editor-heading"><div><div className="eyebrow">CAMÉRA</div><h2 id="picker-title">Quelle séquence ?</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={onClose}><X size={18}/></button></div>
      <div className="picker-list">{rows === null ? <p className="field-hint">Chargement…</p> : rows.length === 0 ? <p className="field-hint">Aucune séquence active. Créez-en une dans Projets.</p> : rows.map(({ sequence, film, characters }) =>
        <button type="button" key={sequence.id} className="picker-row" onClick={() => onPick(sequence.id)}><span><strong>{sequence.sequenceNumber ? `${sequence.sequenceNumber} — ` : ''}{sequence.name}</strong><small>{film?.title} · {characters}</small></span><Camera size={18}/></button>)}</div>
    </section>
  </div>;
}
