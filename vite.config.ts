import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const BASE = '/continuite-cinema/';

/** Après le build : injecte dans service-worker.js la liste des fichiers à pré-charger (usage hors ligne dès la 1re ouverture)
 *  et un identifiant de version qui renouvelle automatiquement le cache à chaque déploiement. */
function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full); else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      const precache = files.filter(f => f !== 'service-worker.js' && f !== 'index.html' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of precache.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'service-worker.js');
      const source = readFileSync(swPath, 'utf8');
      if (!source.includes("'__BUILD_ID__'") || !source.includes('/*__PRECACHE__*/')) throw new Error('service-worker.js : marqueurs de build introuvables.');
      writeFileSync(swPath, source
        .replace("'__BUILD_ID__'", `'${hash.digest('hex').slice(0, 12)}'`)
        .replace('/*__PRECACHE__*/', precache.map(f => JSON.stringify(f)).join(',')));
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  base: BASE,
});
