import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './context/AuthContext';
import WorkspaceAuth from './workspace/WorkspaceAuth';
import Workspace from './views/Workspace';
import { startWorkspacePwa } from './workspace/pwa.mjs';
import './index.css';
import './workspace/workspace.css';

// Workspace web (gba.software/workspace/web). Exige sesión de GBA ID y membresía en el servidor;
// a diferencia del escritorio, no pide licencia ni incluye el actualizador nativo.
function WorkspaceWeb() {
  const { user } = useAuth();
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('workspace-preview') === '1') return <Workspace previewMode />;
  return user ? <Workspace /> : <WorkspaceAuth />;
}

startWorkspacePwa();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><AuthProvider productName="Workspace"><WorkspaceWeb /></AuthProvider></React.StrictMode>
);
