import { useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, ShieldCheck, Share as ShareIcon, X } from 'lucide-react';
import { changePin, createRecoveryCode, hasRecoveryCode } from './lib/lock';

export function formatWait(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`;
}

/** Affiche le code de récupération une seule fois, avec copie et confirmation explicite. */
export function RecoveryCodeNotice({ code, onDone, doneLabel = 'J’ai noté mon code' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [copied, setCopied] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } };
  return <div className="recovery-notice" role="alert">
    <div className="auth-kicker">CODE DE RÉCUPÉRATION</div>
    <h2>Notez ce code maintenant</h2>
    <p className="muted">Si vous oubliez votre code à 6 chiffres, ce code est le <strong>seul moyen</strong> de retrouver l’accès sans perdre vos photos. Il ne sera plus jamais affiché.</p>
    <div className="recovery-code" aria-label="Code de récupération">{code}</div>
    <div className="recovery-actions"><button type="button" className="outline-button" onClick={() => void copy()}><Copy size={16}/>{copied ? 'Copié' : 'Copier'}</button></div>
    <p className="small-muted">Conservez-le hors du téléphone : papier rangé en lieu sûr, gestionnaire de mots de passe ou message à vous-même.</p>
    <label className="character-picker-option"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>J’ai conservé ce code en lieu sûr</span></label>
    <button type="button" className="primary-button full-button" disabled={!confirmed} onClick={onDone}>{doneLabel}</button>
  </div>;
}

/** Changer le code local et renouveler le code de récupération (dans « Sauvegarde »). */
export function SecurityPanel() {
  const [hasRecovery, setHasRecovery] = useState<boolean | undefined>();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | undefined>();
  useEffect(() => { void hasRecoveryCode().then(setHasRecovery).catch(() => setHasRecovery(undefined)); }, [newCode]);
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    if (next !== confirm) return setError('Les deux nouveaux codes ne correspondent pas.');
    setBusy(true);
    try {
      const result = await changePin(current, next);
      if (!result.ok) setError(result.retryAfterMs > 0 ? `Trop d’essais. Réessayez dans ${formatWait(result.retryAfterMs)}.` : 'Le code actuel est incorrect.');
      else { setNotice('Code local modifié.'); setCurrent(''); setNext(''); setConfirm(''); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de modifier le code.'); }
    finally { setBusy(false); }
  }
  async function renew() {
    if (hasRecovery && !window.confirm('L’ancien code de récupération ne fonctionnera plus. Continuer ?')) return;
    try { setNewCode(await createRecoveryCode()); } catch { setError('Impossible de créer le code de récupération.'); }
  }
  return <section className="content-card backup-card security-panel">
    <div className="editor-heading"><div><div className="eyebrow">SÉCURITÉ</div><h2>Code local et récupération</h2></div><div className="storage-icon"><KeyRound size={22}/></div></div>
    {newCode ? <RecoveryCodeNotice code={newCode} onDone={() => setNewCode(undefined)} doneLabel="Terminé"/> : <>
      <div className={`backup-status ${hasRecovery ? '' : 'is-late'}`} role="status"><strong>{hasRecovery === undefined ? 'Code de récupération : état inconnu' : hasRecovery ? 'Un code de récupération existe pour cet appareil' : 'Aucun code de récupération'}</strong><span>{hasRecovery ? 'Il permet de redéfinir le code local si vous l’oubliez.' : 'Sans lui, un code oublié signifie des données inaccessibles. Créez-en un maintenant.'}</span></div>
      <div className="backup-actions"><button type="button" className="outline-button" onClick={() => void renew()}><ShieldCheck size={17}/>{hasRecovery ? 'Générer un nouveau code de récupération' : 'Créer un code de récupération'}</button></div>
      <form onSubmit={e => void submit(e)} className="setup-form">
        <label>Code actuel<input inputMode="numeric" autoComplete="current-password" maxLength={6} value={current} onChange={e => setCurrent(digits(e.target.value))} placeholder="••••••" required/></label>
        <div className="form-grid"><label>Nouveau code<input inputMode="numeric" autoComplete="new-password" maxLength={6} value={next} onChange={e => setNext(digits(e.target.value))} placeholder="••••••" required/></label>
        <label>Confirmer<input inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={e => setConfirm(digits(e.target.value))} placeholder="••••••" required/></label></div>
        {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="workspace-notice" role="status">{notice}</div>}
        <button type="submit" className="outline-button" disabled={busy}>{busy ? 'Vérification…' : 'Changer le code local'}</button>
      </form></>}
  </section>;
}

/** iPhone/iPad dans Safari : iOS peut effacer les données d'un site peu utilisé ; l'app installée sur l'écran d'accueil est protégée. */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('cc-install-hint') === '1'; } catch { return false; } });
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = typeof window !== 'undefined' && (((navigator as unknown as { standalone?: boolean }).standalone === true) || window.matchMedia?.('(display-mode: standalone)').matches);
  if (!isIos || standalone || hidden) return null;
  const dismiss = () => { setHidden(true); try { sessionStorage.setItem('cc-install-hint', '1'); } catch { /* non bloquant */ } };
  return <div className="install-hint" role="note"><ShareIcon size={18}/><span><strong>Installez l’app sur iPhone.</strong> Dans Safari, touchez Partager puis « Sur l’écran d’accueil ». Sans cela, iOS peut effacer vos photos si l’app reste inutilisée quelques jours.</span><button type="button" className="icon-button" aria-label="Masquer" onClick={dismiss}><X size={16}/></button></div>;
}
