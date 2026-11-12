import { nativeWorkspace, registerWorkspaceWorker } from './workspaceServiceWorker.mjs';

export function isAppleMobile(navigator = globalThis.navigator) {
  return /iPhone|iPad|iPod/i.test(navigator?.userAgent || '') ||
    (navigator?.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isWorkspaceStandalone() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone);
}

export function workspaceInstallMode({
  native = nativeWorkspace(), standalone = isWorkspaceStandalone(), ios = isAppleMobile(), prompt = false
} = {}) {
  if (native || standalone) return null;
  if (ios) return 'ios';
  return prompt ? 'prompt' : null;
}

let pendingPrompt, display, installed = false;
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());

export const getWorkspaceInstallMode = () => installed ? null : workspaceInstallMode({ prompt: Boolean(pendingPrompt) });
export function subscribeToWorkspaceInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptWorkspaceInstall() {
  if (getWorkspaceInstallMode() !== 'prompt') return;
  const request = pendingPrompt;
  pendingPrompt = undefined;
  emit();
  const choice = await request.prompt();
  if (choice?.outcome === 'accepted') {
    installed = true;
    emit();
  }
}

export function startWorkspacePwa() {
  if (nativeWorkspace() || display) return;
  display = globalThis.matchMedia('(display-mode: standalone)');
  display.addEventListener?.('change', emit);
  globalThis.addEventListener('beforeinstallprompt', event => {
    if (installed || workspaceInstallMode({ prompt: true }) !== 'prompt') return;
    event.preventDefault();
    pendingPrompt = event;
    emit();
  });
  globalThis.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = undefined;
    emit();
  });

  if (globalThis.isSecureContext && navigator.serviceWorker) {
    registerWorkspaceWorker().catch(error => console.warn('No se pudo preparar la instalación de Workspace.', error));
  }
}
