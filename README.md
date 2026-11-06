# Workspace

App de coordinación editorial de GIMG (GBA): ediciones, asignaciones, revisión área → QA → Dirección, documentos, imágenes (Lapislázuli), calendario, avisos y el puente con Ultramar. Escritorio (macOS y Windows, Tauri 2) y web (`gba.software/workspace/web`).

Desde el 5 de noviembre de 2026 vive en este repositorio, separado de la web de GBA, VISTA y Sepia (`GBA-VISTA-seeitdifferently`). El historial anterior se conserva: los commits y etiquetas de versiones previas son los mismos. Detalle en [docs/SEPARACION.md](docs/SEPARACION.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/workspace/`, `src/views/Workspace.jsx` | La aplicación (React) |
| `src/auth/`, `src/context/AuthContext.jsx`, `src/supabaseClient.js` | Sesión de GBA ID (copia de la que usa la web de GBA) |
| `workspace/` + `vite.workspace.config.js` | Entrada de escritorio → `workspace-dist/` |
| `web/` + `vite.web.config.js` | Entrada web → `dist/workspace/web/` |
| `src-tauri/` | App nativa, actualizador y permisos |
| `cloudflare/workspace-originals/` | Pasarela R2 de originales, imágenes y entregas de Ultramar |
| `supabase/migrations/` | Historial de migraciones de la base compartida (ver docs/SEPARACION.md) |
| `integrations/workspace-mcp/` | Conector de Workspace (paquete propio) |
| `scripts/`, `tests/`, `docs/` | Publicación, pruebas y documentación de versiones |

## Comandos

```bash
npm ci
npm run dev          # escritorio en el navegador (http://localhost:1420, ?workspace-preview=1 para la demo)
npm run web:dev      # versión web (http://localhost:1421/workspace/web/)
npm test             # pruebas de Workspace y de escritorio
npm run desktop:dev  # app nativa (requiere Rust)
```

Variables locales en `.env.local` (no se suben): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Publicación

- **Mac/Windows**: compilación en GitHub Actions de este repo (`Workspace native candidates`) y `scripts/workspace-publish-macos.mjs`. El canal de actualizaciones sigue en las releases de `GBA-VISTA-seeitdifferently`, porque es donde lo buscan las apps instaladas.
- **Web**: proyecto Vercel propio con `vercel.json` de este repo. `gba.software/workspace/web` se enruta a él desde la web de GBA.
