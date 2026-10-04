import { useEffect, useState, type FormEvent } from 'react';
import {
  Aperture, Archive, Camera, Check, ChevronRight, CircleHelp, Clapperboard,
  CloudOff, Database, Film, FolderOpen, LockKeyhole, Menu, Plus,
  Search, Settings, ShieldCheck, Sparkles, Users, X, Image,
} from 'lucide-react';
import { getLocalCounts } from './lib/db';
import ProjectWorkspace from './ProjectWorkspace';
import { createLocalProfile, getProfileEmail, hasLocalProfile, verifyPin } from './lib/lock';

type Section = 'Accueil' | 'Films' | 'Personnages' | 'Séquences' | 'Continuité' | 'Sauvegarde' | 'Paramètres';
const navItems: { label: Section; icon: typeof Film; detail: string }[] = [
  { label: 'Accueil', icon: Aperture, detail: 'Vue d’ensemble de votre espace de travail' },
  { label: 'Films', icon: Clapperboard, detail: 'Tous vos projets cinéma' },
  { label: 'Personnages', icon: Users, detail: 'Fiches personnages et acteurs' },
  { label: 'Séquences', icon: Film, detail: 'Scènes et séquences de tournage' },
  { label: 'Continuité', icon: Camera, detail: 'Références photo coiffure et maquillage' },
  { label: 'Sauvegarde', icon: Archive, detail: 'Exporter et restaurer vos données' },
  { label: 'Paramètres', icon: Settings, detail: 'Préférences et sécurité locale' },
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
  const [mobileNav, setMobileNav] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [continuityAction, setContinuityAction] = useState<'camera' | 'images' | undefined>(undefined);
  const [counts, setCounts] = useState({ films: 0, characters: 0, sequences: 0, photos: 0 });
  const refreshCounts = () => { getLocalCounts().then(setCounts).catch(() => undefined); };
  useEffect(() => { refreshCounts(); }, []);
  const current = navItems.find(n => n.label === section)!;
  const openSection = (next: Section, action?: 'camera' | 'images') => {
    setContinuityAction(action);
    setSection(next);
    setMobileNav(false);
  };
  return <div className="app-shell"><aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="sidebar-top"><Brand/><button type="button" className="icon-button mobile-close" aria-label="Fermer le menu" onClick={() => setMobileNav(false)}><X size={18}/></button></div><div className="workspace-label">ESPACE DE TRAVAIL</div><nav className="main-nav">{navItems.map(item => { const Icon = item.icon; return <button type="button" key={item.label} className={`nav-item ${section === item.label ? 'active' : ''}`} onClick={() => openSection(item.label)}><Icon size={18}/><span>{item.label}</span>{section === item.label && <span className="nav-active-dot"/>}</button>; })}</nav><div className="sidebar-bottom"><div className="offline-status"><span className="status-dot"/><div><strong>Mode local</strong><small>Prêt à travailler hors ligne</small></div></div><button type="button" className="profile-button" onClick={onLock}><div className="avatar">{email.slice(0,1).toUpperCase()}</div><div className="profile-text"><strong>Mon espace</strong><small>{email}</small></div><LockKeyhole size={15} className="profile-lock"/></button></div></aside>
    {mobileNav && <button type="button" aria-label="Fermer la navigation" className="mobile-backdrop" onClick={() => setMobileNav(false)}/>}
    <main className="main-area"><header className="topbar"><button type="button" className="icon-button mobile-menu" aria-label="Ouvrir le menu" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Continuité</span><ChevronRight size={14}/><strong>{section}</strong></div><div className="topbar-actions"><label className="global-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un film, personnage…"/><kbd>⌘ K</kbd></label><button type="button" className="icon-button help-button" title="Aide" aria-label="Ouvrir l’aide" onClick={() => setHelpOpen(true)}><CircleHelp size={18}/></button></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">VOTRE ATELIER NUMÉRIQUE</div><h1>{section === 'Accueil' ? 'Bonjour, bienvenue.' : section}</h1><p>{section === 'Accueil' ? 'Toute votre continuité coiffure et maquillage, au même endroit.' : current.detail}</p></div><button type="button" className="primary-button" onClick={() => openSection('Films')}><Plus size={17}/> Nouveau film</button></div>
      {section === 'Accueil' ? <><div className="welcome-panel"><div className="welcome-copy"><div className="panel-label"><Sparkles size={14}/> VOTRE ESPACE EST PRÊT</div><h2>Le souci du détail,<br/><em>scène après scène.</em></h2><p>Centralisez les looks, les références et les notes de chaque personnage pour retrouver rapidement la bonne continuité sur le plateau.</p><button type="button" className="secondary-button" onClick={() => openSection('Films')}>Découvrir mes films <ChevronRight size={16}/></button></div><div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-lens"><Aperture size={82} strokeWidth={0.8}/></div><div className="art-caption">CONTINUITÉ <span>·</span> 001</div></div></div>
      <div className="section-title-row"><div><h2>Votre activité</h2><p>Les éléments enregistrés sur cet appareil</p></div><span className="local-chip"><Database size={13}/> Stockage local</span></div><div className="stats-grid"><Stat icon={Clapperboard} label="Films" count={counts.films} detail="Projets cinéma"/><Stat icon={Users} label="Personnages" count={counts.characters} detail="Fiches personnages"/><Stat icon={Film} label="Séquences" count={counts.sequences} detail="Scènes enregistrées"/><Stat icon={Camera} label="Photos" count={counts.photos} detail="Références de continuité"/></div><div className="quick-actions"><button type="button" className="quick-action" onClick={() => openSection('Films')}><span className="quick-action-icon"><Clapperboard size={20}/></span><span><strong>Films</strong><small>Films → personnages → séquences</small></span><ChevronRight size={17}/></button><button type="button" className="quick-action" onClick={() => counts.sequences ? openSection('Continuité', 'camera') : openSection('Séquences')}><span className="quick-action-icon"><Camera size={20}/></span><span><strong>Caméra</strong><small>{counts.sequences ? 'Prendre une photo de continuité' : 'Créez une séquence avant la prise de vue'}</small></span><ChevronRight size={17}/></button><button type="button" className="quick-action" onClick={() => openSection('Continuité', 'images')}><span className="quick-action-icon"><Image size={20}/></span><span><strong>Images</strong><small>Voir toutes les photos enregistrées</small></span><ChevronRight size={17}/></button></div>
      <div className="bottom-grid"><section className="content-card next-card"><div className="card-heading"><div><h3>Pour commencer</h3><p>Préparez votre premier projet</p></div><span className="step-count">01 / 04</span></div><div className="check-row"><span className="check-icon"><Check size={15}/></span><div><strong>Espace local initialisé</strong><small>La base de données est prête sur cet appareil.</small></div><span className="done-label">Terminé</span></div><div className="check-row"><span className="step-number">02</span><div><strong>Créer votre premier film</strong><small>Ajoutez un projet pour organiser votre travail.</small></div><button type="button" className="round-arrow" onClick={() => openSection('Films')} aria-label="Créer un film"><ChevronRight size={17}/></button></div><div className="check-row"><span className="step-number">03</span><div><strong>Ajouter un personnage</strong><small>Associez les fiches aux projets.</small></div><button type="button" className="round-arrow" onClick={() => openSection('Personnages')} aria-label="Ajouter un personnage"><ChevronRight size={17}/></button></div><div className="check-row"><span className="step-number">04</span><div><strong>Préparer les références photo</strong><small>Coiffure, maquillage et notes de plateau.</small></div><button type="button" className="round-arrow" onClick={() => openSection('Continuité', 'images')} aria-label="Ouvrir les images"><ChevronRight size={17}/></button></div></section><section className="content-card storage-card"><div className="card-heading"><div><h3>Vos données</h3><p>Stockées localement</p></div><div className="storage-icon"><Database size={20}/></div></div><div className="storage-illustration"><div className="storage-stack stack-back"/><div className="storage-stack stack-mid"/><div className="storage-stack stack-front"><FolderOpen size={25}/><span>LOCAL</span></div></div><div className="storage-note"><ShieldCheck size={16}/><span>Aucune photo n’est envoyée vers un serveur dans cette version de base.</span></div><button type="button" className="outline-button" onClick={() => openSection('Sauvegarde')}>Préparer une sauvegarde <ChevronRight size={15}/></button></section></div>
      </> : <ProjectWorkspace section={section} query={query} onDataChanged={refreshCounts} continuityAction={continuityAction} />}
      {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHelpOpen(false); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="editor-heading"><div><div className="eyebrow">GUIDE RAPIDE</div><h2 id="help-title">Comment utiliser Continuité</h2></div><button type="button" className="icon-button" aria-label="Fermer l’aide" onClick={() => setHelpOpen(false)}><X size={18}/></button></div><div className="help-content"><p><strong>1. Films :</strong> créez un projet pour le tournage.</p><p><strong>2. Personnages :</strong> associez les personnages à un film.</p><p><strong>3. Séquences :</strong> créez les séquences de chaque personnage.</p><p><strong>4. Continuité :</strong> ajoutez des photos par caméra ou depuis la galerie et renseignez coiffure, maquillage, accessoires et notes.</p><p><strong>Stockage :</strong> les données sont conservées dans le navigateur de cet appareil. Export/sauvegarde complète et synchronisation ne sont pas encore implémentés dans cette version.</p></div><div className="editor-actions"><button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Compris</button></div></section></div>}
      <footer className="page-footer"><span>CONTINUITÉ <span className="footer-sep">/</span> PHASE 1 — FONDATION</span><span><span className="status-dot"/> Base locale initialisée</span></footer></div></main></div>;
}

function Stat({ icon: Icon, label, count, detail }: { icon: typeof Film; label: string; count: number; detail: string }) { return <div className="stat-card"><div className="stat-top"><div className="stat-icon"><Icon size={18}/></div><span className="stat-count">{count.toString().padStart(2, '0')}</span></div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>; }
export default function App() {
  const [ready, setReady] = useState(false); const [profile, setProfile] = useState(false); const [unlocked, setUnlocked] = useState(false); const [email, setEmail] = useState('');
  useEffect(() => { (async () => { try { const exists = await hasLocalProfile(); setProfile(exists); if (exists) setEmail(await getProfileEmail()); else setUnlocked(true); } catch { setUnlocked(true); } finally { setReady(true); } })(); }, []);
  if (!ready) return <div className="loading-screen"><Aperture size={28}/><span>Préparation de votre espace…</span></div>;
  if (!profile) return <SetupScreen onComplete={async () => { setEmail(await getProfileEmail()); setProfile(true); setUnlocked(true); }} />;
  if (!unlocked) return <LockScreen email={email} onUnlock={() => setUnlocked(true)} />;
  return <AppShell email={email} onLock={() => setUnlocked(false)} />;
}
