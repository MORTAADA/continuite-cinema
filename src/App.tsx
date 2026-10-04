import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Camera,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';

import ProjectWorkspace from './ProjectWorkspace';

type Section =
  | 'Films'
  | 'Personnages'
  | 'Séquences'
  | 'Continuité'
  | 'Sauvegarde'
  | 'Paramètres';

interface AppProps {
  initialAction?: 'camera' | 'images';
}

export default function App({ initialAction }: AppProps) {
  const [section, setSection] = useState<Section>('Films');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const [counts] = useState({
    films: 0,
    characters: 0,
    sequences: 0,
    photos: 0,
  });

  const refreshCounts = useCallback(async () => {
    // Les compteurs seront alimentés par le stockage réel
    // lorsque les fonctions correspondantes seront disponibles.
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    if (initialAction === 'camera' || initialAction === 'images') {
      setSection('Continuité');
    }
  }, [initialAction]);

  const navigation = useMemo(
    () => [
      {
        id: 'Films' as Section,
        label: 'Films',
        icon: Clapperboard,
        count: counts.films,
      },
      {
        id: 'Personnages' as Section,
        label: 'Personnages',
        icon: Users,
        count: counts.characters,
      },
      {
        id: 'Séquences' as Section,
        label: 'Séquences',
        icon: FolderOpen,
        count: counts.sequences,
      },
      {
        id: 'Continuité' as Section,
        label: 'Continuité',
        icon: Camera,
        count: counts.photos,
      },
    ],
    [counts]
  );

  const utilityNavigation = [
    {
      id: 'Sauvegarde' as Section,
      label: 'Sauvegarde',
      icon: Archive,
    },
    {
      id: 'Paramètres' as Section,
      label: 'Paramètres',
      icon: Settings,
    },
  ];

  const handleNavigation = (nextSection: Section) => {
    setSection(nextSection);
    setMenuOpen(false);
    setQuery('');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <button
            type="button"
            className="icon-button mobile-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={21} />
          </button>

          <button
            type="button"
            className="brand"
            onClick={() => handleNavigation('Films')}
          >
            <div className="brand-mark">
              <Clapperboard size={21} />
            </div>

            <div>
              <div className="brand-title">Continuité Cinéma</div>
              <div className="brand-subtitle">
                Hair &amp; Makeup
              </div>
            </div>
          </button>
        </div>

        <div className="header-center">
          <div className="global-search">
            <Search size={18} />

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un film, personnage, séquence, photo..."
              aria-label="Recherche globale"
            />

            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery('')}
                aria-label="Effacer la recherche"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-action"
            onClick={() => handleNavigation('Continuité')}
          >
            <ImageIcon size={18} />
            <span>Images</span>
          </button>

          <button
            type="button"
            className="header-action primary"
            onClick={() => handleNavigation('Continuité')}
          >
            <Camera size={18} />
            <span>Caméra</span>
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="sidebar-mobile-header">
            <strong>Menu</strong>

            <button
              type="button"
              className="icon-button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
            >
              <X size={20} />
            </button>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">PROJET</div>

            <nav>
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sidebar-item ${
                      active ? 'active' : ''
                    }`}
                    onClick={() => handleNavigation(item.id)}
                  >
                    <Icon size={19} />

                    <span>{item.label}</span>

                    <span className="sidebar-count">
                      {item.count}
                    </span>

                    <ChevronRight
                      size={15}
                      className="sidebar-chevron"
                    />
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-divider" />

          <div className="sidebar-section">
            <div className="sidebar-label">OUTILS</div>

            <nav>
              {utilityNavigation.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sidebar-item ${
                      active ? 'active' : ''
                    }`}
                    onClick={() => handleNavigation(item.id)}
                  >
                    <Icon size={19} />

                    <span>{item.label}</span>

                    <ChevronRight
                      size={15}
                      className="sidebar-chevron"
                    />
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-footer">
            <div className="offline-status">
              <span className="offline-dot" />
              <span>Mode hors ligne actif</span>
            </div>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            className="sidebar-overlay"
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <main className="main-content">
          <div className="content-header">
            <div>
              <div className="breadcrumb">
                <span>Continuité Cinéma</span>
                <ChevronRight size={14} />
                <span>{section}</span>
              </div>

              <h1>{section}</h1>
            </div>

            <div className="content-header-actions">
              {section === 'Continuité' && (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      handleNavigation('Continuité')
                    }
                  >
                    <ImageIcon size={17} />
                    Images
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      handleNavigation('Continuité')
                    }
                  >
                    <Camera size={17} />
                    Ouvrir la caméra
                  </button>
                </>
              )}
            </div>
          </div>

          <ProjectWorkspace
            section={section}
            query={query}
            onDataChanged={refreshCounts}
          />
        </main>
      </div>
    </div>
  );
}
