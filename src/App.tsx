import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Camera, ChevronRight, Clapperboard, FolderOpen, Home, Image as ImageIcon, Menu, Search, Settings, Users, X } from 'lucide-react';
import ProjectWorkspace from './ProjectWorkspace';
import { getLocalCounts } from './lib/db';

type Section = 'Accueil' | 'Films' | 'Personnages' | 'Séquences' | 'Continuité' | 'Sauvegarde' | 'Paramètres';
type Action = 'camera' | 'images' | undefined;

export default function App() {
  const [section, setSection] = useState<Section>('Accueil');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<Action>();
  const [counts, setCounts] = useState({ films: 0, characters: 0, sequences: 0, photos: 0 });

  const refreshCounts = useCallback(async () => {
    try { setCounts(await getLocalCounts()); } catch { /* IndexedDB may not be ready on first paint. */ }
  }, []);
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  const navigate = (next: Section, nextAction?: Action) => {
    setSection(next); setAction(nextAction); setMenuOpen(false);
    if (next !== 'Continuité') setAction(undefined);
    if (next !== 'Accueil') setQuery('');
  };

  const navigation = useMemo(() => [
    { id: 'Accueil' as Section, label: 'Accueil', icon: Home },
    { id: 'Films' as Section, label: 'Films', icon: Clapperboard, count: counts.films },
    { id: 'Personnages' as Section, label: 'Personnages', icon: Users, count: counts.characters },
    { id: 'Séquences' as Section, label: 'Séquences', icon: FolderOpen, count: counts.sequences },
    { id: 'Continuité' as Section, label: 'Continuité', icon: Camera, count: counts.photos },
  ], [counts]);

  return <div className="app-shell">
    <header className="app-header">
      <div className="header-left">
        <button type="button" className="icon-button mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu size={21}/></button>
        <button type="button" className="brand" onClick={() => navigate('Accueil')} aria-label="Retour à l'accueil">
          <div className="brand-mark"><Clapperboard size={21}/></div>
          <div><div className="brand-title">Continuité Cinéma</div><div className="brand-subtitle">Hair &amp; Makeup</div></div>
        </button>
      </div>
      <div className="header-center"><div className="global-search"><Search size={18}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un film, personnage, séquence, photo..." aria-label="Recherche globale"/>{query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Effacer"><X size={16}/></button>}</div></div>
      <div className="header-actions"><button type="button" className="header-action" onClick={() => navigate('Continuité', 'images')}><ImageIcon size={18}/><span>Images</span></button><button type="button" className="header-action primary" onClick={() => navigate('Continuité', 'camera')}><Camera size={18}/><span>Caméra</span></button></div>
    </header>

    <div className="app-layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-mobile-header"><strong>Menu</strong><button type="button" className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Fermer"><X size={20}/></button></div>
        <div className="sidebar-section"><div className="sidebar-label">PROJET</div><nav>{navigation.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={`sidebar-item ${section === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><Icon size={19}/><span>{item.label}</span>{item.count !== undefined && <span className="sidebar-count">{item.count}</span>}<ChevronRight size={15} className="sidebar-chevron"/></button>; })}</nav></div>
        <div className="sidebar-divider"/>
        <div className="sidebar-section"><div className="sidebar-label">OUTILS</div><nav><button type="button" className={`sidebar-item ${section === 'Sauvegarde' ? 'active' : ''}`} onClick={() => navigate('Sauvegarde')}><Archive size={19}/><span>Sauvegarde</span><ChevronRight size={15} className="sidebar-chevron"/></button><button type="button" className={`sidebar-item ${section === 'Paramètres' ? 'active' : ''}`} onClick={() => navigate('Paramètres')}><Settings size={19}/><span>Paramètres</span><ChevronRight size={15} className="sidebar-chevron"/></button></nav></div>
        <div className="sidebar-footer"><div className="offline-status"><span className="offline-dot"/><div><strong>Stockage local actif</strong><small>Données conservées sur cet appareil</small></div></div></div>
      </aside>
      {menuOpen && <button type="button" className="sidebar-overlay" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}/>} 
      <main className="main-content">
        <div className="content-header"><div><div className="breadcrumb"><span>Continuité Cinéma</span><ChevronRight size={14}/><span>{section}</span></div><h1>{section}</h1></div><div className="content-header-actions">{section === 'Continuité' && <><button type="button" className="secondary-button" onClick={() => navigate('Continuité','images')}><ImageIcon size={17}/>Images</button><button type="button" className="primary-button" onClick={() => navigate('Continuité','camera')}><Camera size={17}/>Ouvrir la caméra</button></>}</div></div>
        <ProjectWorkspace section={section} query={query} onDataChanged={refreshCounts} continuityAction={action} onActionHandled={() => setAction(undefined)} onNavigate={navigate}/>
      </main>
    </div>
  </div>;
}
