import { useEffect, useState, type FormEvent } from 'react';
import {
  Aperture, Archive, Camera, ChevronRight, CircleHelp, Clapperboard, CloudOff, Film, Image,
  LockKeyhole, MoreHorizontal, Search, Settings, ShieldCheck, Users, X, Home as HomeIcon,
} from 'lucide-react';
import { getLocalCounts } from './lib/db';
import { getResumeSequence } from './lib/resume';
import { backfillThumbnails } from './lib/photos';
import Home from './Home';
import ProjectWorkspace from './ProjectWorkspace';
import { createLocalProfile, getProfileEmail, hasLocalProfile, verifyPin } from './lib/lock';

type Section = 'Accueil' | 'Projets' | 'Mes photos' | 'Sauvegarde' | 'Paramètres' | 'Personnages' | 'Séquences';
type Launch = { sequenceId: string; nonce: number } | null;
const sectionInfo: Record<Section, { title: string; detail: string }> = {
  Accueil: { title: 'Accueil', detail: '' },
  Projets: { title: 'Projets', detail: 'Films, personnages et séquences' },
  'Mes photos': { title: 'Mes photos', detail: 'Gérez, classez et relisez vos photos de continuité' },
  Sauvegarde: { title: 'Sauvegarde', detail: 'Exporter et restaurer vos données' },
  Paramètres: { title: 'Paramètres', detail: 'Images des catégories' },
  Personnages: { title: 'Tous les personnages', detail: 'Liste complète, archives comprises' },
  Séquences: { title: 'Toutes les séquences', detail: 'Liste complète, archives comprises' },
};
const mainNav: { label: Section; icon: typeof Film }[] = [
  { label: 'Accueil', icon: HomeIcon }, { label: 'Projets', icon: Clapperboard }, { label: 'Mes photos', icon: Image },
];
const moreNav: { label: Section; icon: typeof Film }[] = [
  { label: 'Sauvegarde', icon: Archive }, { label: 'Paramètres', icon: Settings },
  { label: 'Personnages', icon: Users }, { label: 'Séquences', icon: Film },
];

function Brand() {
  return <div className="brand-lockup"><div className="brand-mark"><Aperture size={22} strokeWidth={1.7} /></div><div><div className="brand-name">CONTINUITÉ</div><div className="brand-subtitle">COIFFURE & MAQUILLAGE CINÉMA</div></div></div>;
}

function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Saisissez une adresse e-mail valide.');
    if (!/^\d{6}$/.test(pin)) return setError('Le code local doit contenir 6 chiffres.');
    if (pin !== confirmPin) return setError('Les deux codes ne correspondent pas.');
    await createLocalProfile(email, pin);
    onComplete();
  };
  return <main className="auth-layout"><div className="auth-glow"/><section className="auth-card"><Brand /><div className="auth-kicker">VOTRE ESPACE DE CONTINUITÉ</div><h1>Chaque détail<br/><span>reste à sa place.</span></h1><p className="auth-intro">Organisez les références coiffure et maquillage de vos films, séquences et personnages dans un espace pensé pour le plateau.</p>
    <form onSubmit={submit} className="setup-form"><label>Adresse e-mail<input type="email" autoComplete="email" placeholder="vous@exemple.fr" value={email} onChange={e => setEmail(e.target.value)} required /></label><div className="field-hint">Votre adresse identifie votre profil sur cet appareil.</div><div className="form-grid"><label>Code local à 6 chiffres<input inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="••••••" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></label><label>Confirmer le code<input inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="••••••" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></label></div>{error && <div className="form-error">{error}</div>}<div className="notice"><ShieldCheck size={18}/><span>Vos données restent sur cet appareil. <button type="button" className="text-button" onClick={() => setShowInfo(v => !v)}>À savoir</button>{showInfo && <span className="notice-extra"> Cette première version prépare le profil local. La vérification réelle par e-mail sera branchée à un service d’authentification avant la livraison; ne considérez pas cette étape comme une vérification d’identité.</span>}</span></div><button className="primary-button full-button" type="submit">Créer mon espace <ChevronRight size={17}/></button></form><div className="auth-foot"><LockKeyhole size={14}/> Profil local · Fonctionnement hors ligne après préparation</div></section><div className="auth-side-note"><span className="side-line"/> UN OUTIL DE PLATEAU, PAS UN SIMPLE ALBUM PHOTO</div></main>;
}

function LockScreen({ email, onUnlock }: { email: string; onUnlock: () => void }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (await verifyPin(pin)) onUnlock(); else { setError('Code incorrect. Réessayez.'); setPin(''); } };
  return <main className="lock-layout"><div className="lock-card"><div className="lock-emblem"><LockKeyhole size={27}/></div><Brand/><div className="auth-kicker">ESPACE VERROUILLÉ</div><h1>Bon retour.</h1><p className="muted">{email}</p><form onSubmit={submit} className="setup-form"><label>Code local<input autoFocus inputMode="numeric" maxLength={6} placeholder="••••••" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button full-button" type="submit">Déverrouiller <ChevronRight size={17}/></button></form><p className="small-muted"><CloudOff size={14}/> Vos projets restent sur cet appareil.</p></div></main>;
}

function AppShell({ email, onLock }: { email: string; onLock: () => void }) {
  const [section, setSection] = useState<Section>('Accueil');
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [launch, setLaunch] = useState<Launch>(null);
  const [counts, setCounts] = useState({ films: 0, characters: 0, sequences: 0, photos: 0 });
  const [homeKey, setHomeKey] = useState(0);
  const [photoToOpen, setPhotoToOpen] = useState<{ id: string; nonce: number } | null>(null);
  const refreshCounts = () => { getLocalCounts().then(setCounts).catch(() => undefined); };
  useEffect(() => {
    refreshCounts();
    // Protection : demande un stockage persistant (silencieux) et complète les miniatures des anciennes photos.
    try { void navigator.storage?.persist?.(); } catch { /* non bloquant */ }
    const timer = window.setTimeout(() => { void backfillThumbnails().then(n => { if (n) refreshCounts(); }).catch(() => undefined); }, 2500);
    return () => window.clearTimeout(timer);
  }, []);
  const openSection = (next: Section) => {
    setLaunch(null); setPhotoToOpen(null); setMoreOpen(false); setQuery('');
    if (next === 'Accueil') setHomeKey(k => k + 1);
    setSection(next);
  };
  /** « Photographier » : ouvre la caméra sur la séquence indiquée, sinon sur la dernière utilisée. */
  const startCamera = async (sequenceId?: string) => {
    const target = sequenceId ?? (await getResumeSequence())?.id;
    setMoreOpen(false); setQuery('');
    if (!target) { setLaunch(null); setSection(counts.films === 0 ? 'Accueil' : 'Projets'); return; }
    setLaunch({ sequenceId: target, nonce: Date.now() }); setSection('Projets');
  };
  const openPhoto = (photoId: string) => { setLaunch(null); setQuery(''); setPhotoToOpen({ id: photoId, nonce: Date.now() }); setSection('Mes photos'); };
  const info = sectionInfo[section];
  const navButton = (item: { label: Section; icon: typeof Film }) => { const Icon = item.icon; return <button type="button" key={item.label} className={`nav-item ${section === item.label ? 'active' : ''}`} onClick={() => openSection(item.label)}><Icon size={18}/><span>{sectionInfo[item.label].title}</span>{section === item.label && <span className="nav-active-dot"/>}</button>; };
  const moreActive = moreNav.some(item => item.label === section);
  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-top"><Brand/></div>
    <button type="button" className="sidebar-shoot" onClick={() => void startCamera()}><Camera size={19}/><span>Photographier</span></button>
    <nav className="main-nav">{mainNav.map(navButton)}</nav>
    <div className="workspace-label nav-more-label">PLUS</div><nav className="main-nav">{moreNav.map(navButton)}</nav>
    <div className="sidebar-bottom"><div className="offline-status"><span className="status-dot"/><div><strong>Mode local</strong><small>Prêt à travailler hors ligne</small></div></div><button type="button" className="profile-button" onClick={onLock}><div className="avatar">{email.slice(0,1).toUpperCase()}</div><div className="profile-text"><strong>Mon espace</strong><small>{email}</small></div><LockKeyhole size={15} className="profile-lock"/></button></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span className="breadcrumb-brand"><Aperture size={16}/> Continuité</span><ChevronRight size={14}/><strong>{info.title}</strong></div><div className="topbar-actions">{section !== 'Accueil' && <label className="global-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher"/></label>}<button type="button" className="icon-button help-button" title="Aide" aria-label="Ouvrir l’aide" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/></button></div></header>
      <div className="page-content">
        {section === 'Accueil'
          ? <Home key={homeKey} onOpenSection={openSection} onStartCamera={id => void startCamera(id)} onOpenPhoto={openPhoto} onDataChanged={refreshCounts}/>
          : <><div className="page-heading"><div><h1>{info.title}</h1><p>{info.detail}</p></div></div>
            <ProjectWorkspace section={section} query={query} onDataChanged={refreshCounts} launch={launch} onLaunchHandled={() => setLaunch(null)} openPhotoId={photoToOpen?.id} openPhotoNonce={photoToOpen?.nonce}/></>}
      </div></main>
    <nav className="bottom-nav" aria-label="Navigation principale">
      <button type="button" className={section === 'Accueil' ? 'active' : ''} onClick={() => openSection('Accueil')}><HomeIcon size={22}/><span>Accueil</span></button>
      <button type="button" className={section === 'Projets' ? 'active' : ''} onClick={() => openSection('Projets')}><Clapperboard size={22}/><span>Projets</span></button>
      <button type="button" className="bottom-nav-camera" aria-label="Photographier" onClick={() => void startCamera()}><Camera size={26}/></button>
      <button type="button" className={section === 'Mes photos' ? 'active' : ''} onClick={() => openSection('Mes photos')}><Image size={22}/><span>Mes photos</span></button>
      <button type="button" className={moreActive || moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)}><MoreHorizontal size={22}/><span>Plus</span></button>
    </nav>
    {moreOpen && <div className="modal-backdrop more-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setMoreOpen(false); }}><section className="editor-modal more-sheet" role="dialog" aria-modal="true" aria-label="Plus"><div className="editor-heading"><div><div className="eyebrow">PLUS</div><h2>Autres outils</h2></div><button type="button" className="icon-button" aria-label="Fermer" onClick={() => setMoreOpen(false)}><X size={18}/></button></div>
      <div className="more-list">{moreNav.map(item => { const Icon = item.icon; return <button type="button" key={item.label} className="more-item" onClick={() => openSection(item.label)}><Icon size={20}/><span>{sectionInfo[item.label].title}</span><ChevronRight size={16}/></button>; })}
        <button type="button" className="more-item" onClick={() => { setMoreOpen(false); setHelpOpen(true); }}><CircleHelp size={20}/><span>Aide</span><ChevronRight size={16}/></button>
        <button type="button" className="more-item" onClick={() => { setMoreOpen(false); onLock(); }}><LockKeyhole size={20}/><span>Verrouiller · {email}</span><ChevronRight size={16}/></button></div></section></div>}
    {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHelpOpen(false); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="editor-heading"><div><div className="eyebrow">GUIDE RAPIDE</div><h2 id="help-title">Comment utiliser Continuité</h2></div><button type="button" className="icon-button" aria-label="Fermer l’aide" onClick={() => setHelpOpen(false)}><X size={18}/></button></div><div className="help-content"><p><strong>Photographier :</strong> le grand bouton ouvre la caméra sur la dernière séquence utilisée. Chaque photo est enregistrée aussitôt; touchez la miniature pour l’ouvrir en plein écran.</p><p><strong>Plein écran :</strong> retour à la caméra, suppression, et « Détails » pour classer la photo (film, personnage, séquence) et ajouter notes, coiffure, maquillage. Tout s’enregistre automatiquement.</p><p><strong>Projets :</strong> film → personnage → séquence. Ouvrez une séquence pour voir ses photos ou photographier.</p><p><strong>Mes photos :</strong> toutes vos photos, avec filtres par film, personnage ou séquence.</p><p><strong>Sauvegarde :</strong> les données restent sur cet appareil. Exportez régulièrement un fichier de sauvegarde et conservez-le séparément. Google Drive n’est pas encore connecté.</p></div><div className="editor-actions"><button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Compris</button></div></section></div>}
  </div>;
}

export default function App() {
  const [ready, setReady] = useState(false); const [profile, setProfile] = useState(false); const [unlocked, setUnlocked] = useState(false); const [email, setEmail] = useState('');
  useEffect(() => { (async () => { try { const exists = await hasLocalProfile(); setProfile(exists); if (exists) setEmail(await getProfileEmail()); else setUnlocked(true); } catch { setUnlocked(true); } finally { setReady(true); } })(); }, []);
  if (!ready) return <div className="loading-screen"><Aperture size={28}/><span>Préparation de votre espace…</span></div>;
  if (!profile) return <SetupScreen onComplete={async () => { setEmail(await getProfileEmail()); setProfile(true); setUnlocked(true); }} />;
  if (!unlocked) return <LockScreen email={email} onUnlock={() => setUnlocked(true)} />;
  return <AppShell email={email} onLock={() => setUnlocked(false)} />;
}
