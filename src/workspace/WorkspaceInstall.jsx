import React, { useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { getWorkspaceInstallMode, promptWorkspaceInstall, subscribeToWorkspaceInstall } from './pwa.mjs';

export default function WorkspaceInstall() {
  const mode = useSyncExternalStore(subscribeToWorkspaceInstall, getWorkspaceInstallMode);
  const [instructions, setInstructions] = useState(false);
  const [error, setError] = useState(false);
  if (!mode && !error) return null;

  function install() {
    if (mode === 'ios') setInstructions(value => !value);
    else void promptWorkspaceInstall().catch(() => setError(true));
  }

  return <div className="gw-install">
    {mode && <button type="button" onClick={install} aria-expanded={mode === 'ios' ? instructions : undefined}
      aria-controls={mode === 'ios' ? 'workspace-install-help' : undefined}>
      <Download size={16} aria-hidden="true" /> Instalar app
    </button>}
    {mode === 'ios' && <p id="workspace-install-help" hidden={!instructions}>Abre Workspace en Safari, toca <strong>Compartir</strong> y elige <strong>Agregar a inicio</strong>. Si aparece «Abrir como app web», déjalo activado.</p>}
    {error && <p role="status">Puedes volver a intentarlo desde la opción de instalación de tu navegador.</p>}
  </div>;
}
