import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .catch((error: unknown) => {
        console.error('Impossible d’activer le mode hors ligne :', error);
      });
  });
}

// Demande au navigateur de conserver les photos locales lorsque cette API est disponible.
if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.persist) {
  window.addEventListener('load', () => {
    void navigator.storage.persist().then(granted => {
      if (!granted) console.info('Le navigateur n’a pas accordé le stockage persistant. Exportez régulièrement vos données.');
    }).catch(() => undefined);
  });
}
