# Separación de Workspace · 5 de noviembre de 2026

Santiago pidió separar Workspace de la web de GBA, VISTA y Sepia en un repositorio propio, con su versión web como proyecto aparte.

## Cómo se hizo

- Base: rama `claude/workspace-1-7-5-ultramar` de GBA-VISTA (`c05b67a`) = producción 1.7.2.1 (diseño de 1.7.1.4) + puente con Ultramar apagado.
- Se conserva el **historial completo** de GBA-VISTA (235 commits, 7,8 MB). Así los commits y etiquetas de versiones anteriores siguen siendo los mismos y las comprobaciones de publicación que comparan contra ellos (identidad, Cuarzo, 1.6.5, conector) siguen funcionando. El commit de separación borra del árbol todo lo que no es Workspace.
- Antes de separar, una sola dependencia de código cruzaba carpetas: la sesión de GBA ID. Se copió (ver abajo).

## Qué vive aquí

App (escritorio y web), Tauri, pasarela R2 (`cloudflare/workspace-originals`), conector (`integrations/workspace-mcp`), scripts de compilación y publicación, pruebas (incluidas las SQL en vivo), documentación de versiones, y la página de descargas como fuente (`public/gba/workspace`).

## Qué se queda en GBA-VISTA y por qué

| Pieza | Motivo |
|---|---|
| `api/gba-id.js` (GBA ID) y su prueba | Servicio del dominio compartido por VISTA, Mothership, Sepia y Workspace; tiene claves de servidor |
| `api/workspace-push.js` y `api/workspace-connector-config.js` (prueba `workspace-push-api` en GBA-VISTA; el cliente de avisos se prueba aquí en `notification-client`) | Usan claves de producción (VAPID) configuradas en el proyecto Vercel de GBA, y pg_cron llama a `https://gba.software/api/workspace-push`. Moverlos requiere trasladar esas claves con autorización |
| Página de descargas servida en `gba.software/workspace` | Usa los estilos generales del sitio de GBA. Este repo conserva la fuente; si cambia `releases.json`, se refleja allá |
| `WorkspaceAuth` y `WorkspacePublications` | VISTA y Mothership los reutilizan (pantalla de acceso y publicaciones de GIMG) |

## Código compartido copiado

`src/auth/`, `src/context/AuthContext.jsx`, `src/supabaseClient.js`, `src/components/social/CreditsPanel.jsx`, `src/utils/social.js`, `src/index.css`. Son copias de GBA-VISTA a la fecha de la separación; la lógica de sesión está protegida por `scripts/workspace-identity-acceptance.mjs`. Cualquier cambio de sesión debe acordarse en ambos repositorios.

## Base de datos

Un solo proyecto Supabase (`wgihpztgwsovhykboyru`) para todo GBA. `supabase/migrations/` conserva el historial completo para que las pruebas locales (PGlite) reproduzcan el esquema. **Workspace es dueño de las migraciones `workspace_*`**; las demás (VISTA, GIMG, Sepia, GBA ID) se editan sólo en GBA-VISTA y aquí se copian cuando cambian. Las migraciones se aplican una por una con autorización, no con un `db push` desde ningún repo.

## Publicación

- El canal del actualizador (`latest-darwin.json`, `latest-windows.json`, `latest.json`) sigue en las releases de **GBA-VISTA**: es la URL que tienen las apps instaladas (`tauri.conf.json`). `scripts/workspace-update-manifest.mjs` separa `REPOSITORY` (canal) de `SOURCE_REPOSITORY` (este repo, donde corre CI). Las releases nuevas registran el commit de este repo en sus notas.
- Mover el canal a este repo exige antes una versión de transición publicada en el canal actual que cambie el `endpoint` del actualizador.

## Estado al cierre (5 de noviembre de 2026)

- **Repositorio**: [santiagohzszmex/gba-workspace](https://github.com/santiagohzszmex/gba-workspace), público como GBA-VISTA, con `main` y las 26 etiquetas de versiones. Variables públicas de CI (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) copiadas; no hay secretos.
- **Compilación nativa desde este repo**: [run 42154497428](https://github.com/santiagohzszmex/gba-workspace/actions/runs/42154497428) aprobada (validación, Mac Apple Silicon, Mac Intel y Windows).
- **Web**: proyecto Vercel `gba-workspace` con dominio propio `workspace.gba.software` (CNAME en name.com hacia Vercel, certificado emitido). `gba.software/workspace/web` y `/workspace/notification-worker.js` se enrutan a él desde GBA-VISTA.
- **GBA-VISTA**: producción publicada desde la rama `claude/separar-workspace` (`be55378`): sin el código de Workspace, con lo listado arriba. Verificado: `/`, `/workspace/web`, `/workspace`, trabajador e icono de avisos, `/sepia`, `/ultramar`, `/mothership`, `/vista`, `/keynotes`, `/convocatoria/gimg`, configuración de Sepia, `releases.json`; avisos `POST` sin credencial 401; GBA ID responde. Workspace web carga sin errores en consola.
- Pruebas: todas las de este repo y las 10 de VISTA aprobadas.

## Siguiente

- Mover `api/workspace-push.js` y `api/workspace-connector-config.js` a este proyecto cuando se autorice trasladar sus claves.
- Mover el canal del actualizador a este repo con una versión de transición.
- La rama `claude/workspace-1-7-5-ultramar` de GBA-VISTA queda superada por `main` de este repo.
