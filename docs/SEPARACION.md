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

## Pendiente

1. Crear el repositorio en GitHub, subir el historial y activar el flujo de compilación nativa.
2. Proyecto Vercel de Workspace web (variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`), vista previa verificada y, con autorización, enrutar `gba.software/workspace/web` y `/workspace/notification-worker.js` hacia él.
3. Limpiar GBA-VISTA: quitar el código de Workspace salvo lo listado arriba y añadir el enrutamiento.
