import React, { useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authenticateGbaId } from '../auth/identityGateway';
import { workspaceIdentityRequest } from '../auth/workspaceIdentity.mjs';
import workspaceIcon from '../../src-tauri/icons/128x128.png';
import './workspaceAuth.css';

export default function WorkspaceAuth({productName = 'Workspace'}) {
  const [mode, setMode] = useState('login');
  const [handle, setHandle] = useState('');
  const [pin, setPin] = useState('');
  const [recovery, setRecovery] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const nameInput = useRef(null);
  const recovering = mode === 'recover';
  const registering = mode === 'register';

  function changeMode(nextMode) {
    setMode(nextMode);
    setPin('');
    setRecovery('');
    setConfirmation('');
    setRecoverySaved(false);
    setShowPin(false);
    setShowRecovery(false);
    setError('');
    nameInput.current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    let request;
    try {
      request = workspaceIdentityRequest(mode, {handle, pin, confirmation, recovery, recoverySaved});
    } catch (failed) {
      setError(failed.message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await authenticateGbaId(request.action, request.handle, request.pin, request.recovery);
      setRecovery('');
    } catch (failed) {
      setError(failed.message || 'No pudimos entrar. Revisa tus datos e inténtalo de nuevo.');
      setPin('');
      setConfirmation('');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="wa" aria-labelledby="workspace-access-title">
    <header className="wa-header"><div className="wa-brand"><img src={workspaceIcon} alt="" width="36" height="36" /><span>{productName}</span></div><span className="wa-byline">GBA Forge</span></header>
    <section className="wa-card">
      <img className="wa-icon" src={workspaceIcon} alt="" width="88" height="88" />
      <p className="wa-eyebrow">{productName === 'Mothership' ? 'ADMINISTRACIÓN DE GBA' : 'EL ESPACIO DE TRABAJO DE GIMG'}</p>
      <h1 id="workspace-access-title">{recovering ? 'Recupera tu acceso.' : registering ? 'Crea tu GBA ID.' : `Bienvenido a ${productName}.`}</h1>
      <p className="wa-intro">{recovering ? 'Usa el código o la frase que guardaste al crear tu GBA ID y elige un nuevo PIN.' : registering ? 'Una misma cuenta para GBA y Workspace. Elige tu nombre y un PIN de 4 dígitos; no necesitas correo.' : 'Entra con tu GBA ID para continuar con tu equipo.'}</p>
      {!recovering && <div className="wa-modes" role="group" aria-label="Acceso con GBA ID"><button type="button" disabled={busy} aria-pressed={!registering} onClick={() => changeMode('login')}>Iniciar sesión</button><button type="button" disabled={busy} aria-pressed={registering} onClick={() => changeMode('register')}>Crear GBA ID</button></div>}
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy}>
          <label className="wa-field" htmlFor="workspace-gba-id">Tu GBA ID
            <input ref={nameInput} id="workspace-gba-id" name="username" autoComplete="username" type="text" maxLength={65} autoCapitalize="none" spellCheck="false" required value={handle} onChange={event => setHandle(event.target.value)} placeholder="Tu nombre o @usuario" aria-describedby="workspace-account-help" />
          </label>
          <p id="workspace-account-help" className="wa-field-help">{recovering ? 'El mismo nombre que usas para iniciar sesión.' : registering ? 'Si ya te postulaste a GIMG o tienes una cuenta de GBA, inicia sesión con ella.' : 'Si te postulaste a GIMG, usa el nombre de esa cuenta.'}</p>
          <div className="wa-field"><label htmlFor="workspace-pin">{recovering ? 'Nuevo PIN' : registering ? 'Elige tu PIN' : 'Tu PIN'}</label>
            <span className="wa-pin"><input id="workspace-pin" name="password" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-describedby="workspace-pin-help" /><button type="button" onClick={() => setShowPin(current => !current)} aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'} aria-pressed={showPin}>{showPin ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span>
          </div>
          <p id="workspace-pin-help" className="wa-field-help">Tu clave de acceso de 4 dígitos.</p>
          {mode !== 'login' && <label className="wa-field" htmlFor="workspace-pin-confirm">{recovering ? 'Confirma tu nuevo PIN' : 'Confirma tu PIN'}
            <input id="workspace-pin-confirm" name="password-confirmation" type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>}
          {mode !== 'login' && <><div className="wa-field"><label htmlFor="workspace-recovery">{registering ? 'Elige una frase de recuperación' : 'Código o frase de recuperación'}</label>
            <span className="wa-pin"><input id="workspace-recovery" name="recovery" type={showRecovery ? 'text' : 'password'} autoComplete="off" minLength={registering ? 8 : undefined} maxLength={256} required value={recovery} onChange={event => {setRecovery(event.target.value);setRecoverySaved(false);}} aria-describedby={registering ? 'workspace-recovery-help' : undefined} /><button type="button" onClick={() => setShowRecovery(current => !current)} aria-label={showRecovery ? 'Ocultar frase de recuperación' : 'Mostrar frase de recuperación'} aria-pressed={showRecovery}>{showRecovery ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></span>
          </div>{registering && <><p id="workspace-recovery-help" className="wa-field-help">Usa al menos 8 caracteres y guarda esta frase en un lugar privado. La necesitarás si olvidas tu PIN.</p><label className="wa-check"><input type="checkbox" required checked={recoverySaved} onChange={event => setRecoverySaved(event.target.checked)} /><span>He guardado mi frase de recuperación.</span></label></>}</>}
          {error && <p className="wa-error" role="alert">{error}</p>}
          <button className="wa-submit" type="submit">{busy ? <><Loader2 size={18} className="wa-spinner" aria-hidden="true" />{registering ? 'Creando tu cuenta…' : 'Comprobando acceso…'}</> : <>{recovering ? 'Recuperar y entrar' : registering ? 'Crear mi GBA ID' : 'Entrar a Workspace'}<ArrowRight size={18} aria-hidden="true" /></>}</button>
        </fieldset>
      </form>
      {!registering && <button className="wa-text-button" type="button" disabled={busy} onClick={() => changeMode(recovering ? 'login' : 'recover')}>{recovering ? 'Volver al inicio de sesión' : '¿Olvidaste tu PIN?'}</button>}
      {!recovering && <p className="wa-team-note">{registering ? 'Crear tu GBA ID no activa el acceso a Workspace. Tus producciones y asignaciones aparecerán cuando tu equipo te dé acceso.' : 'Tus producciones y asignaciones aparecerán cuando el equipo active tu acceso.'}</p>}
    </section>
    <footer className="wa-footer">GBA ID · Una misma cuenta para tu equipo.</footer>
  </main>;
}
