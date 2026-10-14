import { useEffect, useState, type ChangeEvent } from 'react';
import { Archive, Download, HardDrive, RefreshCw, Share2, ShieldCheck, Upload } from 'lucide-react';
import { rememberBackup, LAST_BACKUP_KEY } from './lib/home';
import { getSetting } from './lib/db';
import { exportBackup, getStorageStatus, requestPersistentStorage, restoreBackup } from './lib/backup';

type Props = { onDataChanged: () => void };
function formatBytes(value?: number) {
  if (value === undefined) return 'Indisponible';
  if (value < 1024) return `${value} o`;
  const units = ['Ko', 'Mo', 'Go', 'To']; let amount = value / 1024; let i = 0;
  while (amount >= 1024 && i < units.length - 1) { amount /= 1024; i++; }
  return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
}
const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
export default function BackupWorkspace({ onDataChanged }: Props) {
  const [usage, setUsage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [lastBackup, setLastBackup] = useState<string | undefined>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function refresh() { try { setUsage(await getStorageStatus()); } catch { setUsage({}); } try { setLastBackup(await getSetting<string>(LAST_BACKUP_KEY)); } catch { /* indicatif */ } }
  useEffect(() => { void refresh(); }, []);
  const backupName = () => `continuite-cinema-backup-${new Date().toISOString().slice(0, 10)}.ccbackup`;
  async function downloadBackup() {
    setBusy(true); setError(''); setNotice('');
    try {
      const blob = await exportBackup(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = backupName();  a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      await rememberBackup();
      setNotice(`Sauvegarde créée (${formatBytes(blob.size)}). Conservez ce fichier dans un endroit sûr.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'La sauvegarde a échoué.'); }
    finally { setBusy(false); await refresh(); }
  }
  /** Partage natif (Drive, WhatsApp, e-mail, AirDrop…) quand le navigateur accepte les fichiers. */
  async function shareBackup() {
    setBusy(true); setError(''); setNotice('');
    try {
      const blob = await exportBackup(); const file = new File([blob], backupName(), { type: 'application/octet-stream' });
      if (!navigator.canShare?.({ files: [file] })) { setError('Ce navigateur ne peut pas partager ce fichier. Utilisez « Télécharger la sauvegarde », puis envoyez le fichier depuis vos Téléchargements.'); return; }
      await navigator.share({ files: [file], title: 'Sauvegarde Continuité' });
      await rememberBackup(); setNotice(`Sauvegarde partagée (${formatBytes(blob.size)}). Vérifiez qu’elle est bien arrivée à destination.`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Le partage a échoué. Utilisez « Télécharger la sauvegarde ».');
    } finally { setBusy(false); await refresh(); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!window.confirm('La restauration remplacera les données actuellement présentes sur cet appareil. Créez une sauvegarde de l’état actuel avant de continuer. Voulez-vous poursuivre ?')) return;
    setBusy(true); setError(''); setNotice('');
    try { const counts = await restoreBackup(file); setNotice(`Restauration terminée : ${counts.films} film(s), ${counts.characters} personnage(s), ${counts.sequences} séquence(s), ${counts.photos} photo(s).`); onDataChanged(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'La restauration a échoué. Les données actuelles n’ont pas été volontairement effacées.'); }
    finally { setBusy(false); }
  }
  async function persist() {
    setBusy(true); setError(''); setNotice('');
    try { const result = await requestPersistentStorage(); setNotice(result === undefined ? 'Ce navigateur ne permet pas de demander le stockage persistant.' : result ? 'Le navigateur a accepté le stockage persistant. Cela ne remplace pas une sauvegarde.' : 'Le navigateur n’a pas accordé le stockage persistant. Exportez régulièrement une sauvegarde.'); await refresh(); }
    catch { setError('Impossible de vérifier la persistance du stockage.'); } finally { setBusy(false); }
  }
  const percent = usage.usage && usage.quota ? Math.min(100, Math.round(usage.usage / usage.quota * 100)) : undefined;
  return <div className="workspace-stack backup-workspace">
    <section className="content-card backup-card"><div className="editor-heading"><div><div className="eyebrow">PROTECTION DES DONNÉES</div><h2>Vos projets restent sur cet appareil</h2></div><div className="storage-icon"><ShieldCheck size={22}/></div></div><p className="backup-intro">Les photos originales sont conservées localement. Exportez régulièrement une copie indépendante : le stockage du navigateur peut être effacé par l’utilisateur ou le système.</p>
      {usage.usage !== undefined && <div className="storage-meter"><div className="storage-meter-label"><span><HardDrive size={15}/> Stockage utilisé par le navigateur</span><strong>{formatBytes(usage.usage)}{usage.quota ? ` / ${formatBytes(usage.quota)}` : ''}</strong></div>{percent !== undefined && <div className="storage-track"><div className="storage-fill" style={{ width: `${percent}%` }}/></div>}<small>{percent !== undefined ? `${percent}% de la capacité annoncée par le navigateur. Ce chiffre peut inclure d’autres données du site.` : 'La capacité disponible ne peut pas être estimée dans ce navigateur.'} · Stockage persistant : {usage.persisted === undefined ? 'état inconnu' : usage.persisted ? 'accordé' : 'non accordé'}</small></div>}{percent !== undefined && percent >= 85 && <div className="form-error storage-near-full">Le stockage semble proche de sa limite. Exportez une sauvegarde et vérifiez l’espace disponible. Aucune photo ne sera supprimée automatiquement.</div>}
      {(() => { const days = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86_400_000) : undefined; const late = days === undefined || days >= 7; return <div className={`backup-status ${late ? 'is-late' : ''}`} role="status"><strong>{days === undefined ? 'Aucune sauvegarde enregistrée sur cet appareil' : days === 0 ? 'Dernière sauvegarde : aujourd’hui' : `Dernière sauvegarde : il y a ${days} jour${days > 1 ? 's' : ''}`}</strong><span>{late ? 'Faites une sauvegarde maintenant et envoyez-la hors du téléphone (Drive, e-mail, ordinateur).' : 'Pensez à la sauvegarder de nouveau après chaque journée de tournage.'}</span></div>; })()}
      <div className="backup-actions">{canShareFiles && <button type="button" className="primary-button" onClick={() => void shareBackup()} disabled={busy}><Share2 size={17}/>{busy ? 'Préparation…' : 'Sauvegarder et partager'}</button>}<button type="button" className={canShareFiles ? 'outline-button' : 'primary-button'} onClick={() => void downloadBackup()} disabled={busy}><Download size={17}/>{busy ? 'Préparation…' : 'Télécharger la sauvegarde'}</button><label className={`outline-button file-import-button ${busy ? 'disabled' : ''}`}><Upload size={17}/>Restaurer un fichier<input type="file" accept="application/octet-stream,.ccbackup" onChange={e => void importFile(e)} disabled={busy}/></label><button type="button" className="outline-button" onClick={() => void persist()} disabled={busy}><ShieldCheck size={17}/>Protéger le stockage</button></div>
      <div className="backup-warning"><Archive size={18}/><div><strong>À connaître avant de restaurer</strong><p>La restauration remplace les données locales actuelles. Elle ne supprime pas les anciennes copies de sauvegarde enregistrées ailleurs. Pour un très grand volume d’images, le fichier de sauvegarde est un format binaire unique qui conserve les Blobs originaux sans expansion base64 ni recompression. Pour les très grands volumes, le temps de création et l’espace temporaire dépendent encore du navigateur et du téléphone.</p></div></div>
      {notice && <div className="workspace-notice" role="status">{notice}</div>}{error && <div className="form-error" role="alert">{error}</div>}
      <button type="button" className="text-button refresh-storage" onClick={() => void refresh()}><RefreshCw size={14}/> Actualiser les informations de stockage</button>
    </section>
  </div>;
}
