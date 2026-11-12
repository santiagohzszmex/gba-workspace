export const WORKSPACE_WORKER = '/workspace/notification-worker.js';
export const WORKSPACE_WORKER_SCOPE = '/workspace/';

export const nativeWorkspace = () => Boolean(globalThis.__TAURI_INTERNALS__);
let registration;

export function registerWorkspaceWorker() {
  if (!globalThis.isSecureContext || nativeWorkspace() || !globalThis.navigator?.serviceWorker) {
    return Promise.reject(Error('Este dispositivo no admite el servicio web de Workspace.'));
  }
  registration ||= navigator.serviceWorker.register(WORKSPACE_WORKER, {
    scope: WORKSPACE_WORKER_SCOPE,
    updateViaCache: 'none'
  }).catch(error => {
    registration = undefined;
    throw error;
  });
  return registration;
}
