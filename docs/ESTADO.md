# Estado de publicación de Workspace

Una sola tabla con lo que está publicado en cada canal. Actualizar en cada publicación.

**Última actualización: 11 de noviembre de 2026.**

| Pieza | Versión publicada | Dónde | Notas |
|---|---|---|---|
| App de escritorio · macOS (actualizador) | **1.7.5** Lapislázuli (nativa 1.7.500), publicada el 10 nov · [release](https://github.com/santiagohzszmex/GBA-VISTA-seeitdifferently/releases/tag/workspace-v1.7.5-beta.1) | `latest-darwin.json` en la release `workspace-updates` de `GBA-VISTA-seeitdifferently` | Antes: 1.7.2.1 (4 nov). Beta sin notarización; paquetes firmados con la llave de Workspace |
| App de escritorio · Windows (actualizador) | 1.6.6.3 Cuarzo | `latest-windows.json` (17 oct) | Lapislázuli no se ofrece en Windows hasta la prueba interactiva |
| Canal compartido (instalaciones antiguas) | 1.6.6.3 puente | `latest.json` (17 oct) | Lleva a las Mac antiguas a Lapislázuli |
| Página pública de descargas | 1.5.0 base | `gba.software/workspace` (`public/gba/workspace/releases.json`) | Intencionalmente fija; los scripts de publicación exigen que no cambie |
| Web | 1.7.5 (`e5dbabf`) | `workspace.gba.software` (Vercel `gba-workspace`) | Despliegue automático desde `main` |
| Pasarela de archivos (Worker `workspace-originals`) | 1.7.5 · versión `20d761b4` | `workspace-originals.gba-vista.workers.dev` | 11 nov: acepta `workspace.gba.software` (mismo código que `b49b83d0`). Antes: 1.7.0 (`937db032`, 17 oct) |
| Base de datos (Supabase `wgihpztgwsovhykboyru`) | 1.7.5 + adelanto de 1.8.0 (`workspace_production_kinds`, 11 nov) | — | 1.7.5: puente y corrección aplicados el 10 nov. 1.8.0: tipos de producción aplicados antes de publicar la web; sin efecto visible hasta entonces |
| Puente con Ultramar | **Encendido** (`upload_policy.ultramar_enabled = true`) | — | Límites: 90 MB `.ultramar`, 90 MB PDF, 20 MB vista previa (4096 px). Apagar: `update workspace_private.upload_policy set ultramar_enabled=false` |

## Corrección del 11 de noviembre: archivos en la web nueva

La pasarela de archivos rechazaba las solicitudes de `workspace.gba.software` (403 por origen), así que en la web nueva no
se podían subir ni descargar referencias, imágenes ni archivos de Ultramar. Autorizado por Santiago: se agregó ese dominio a
`ALLOWED_ORIGINS` y se desplegó la versión `20d761b4` (commit `c2fd431`, mismo código que `b49b83d0`). Verificado:
`workspace.gba.software` y `gba.software` responden 204 en imágenes, referencias y Ultramar; otros orígenes y dominios
parecidos siguen en 403; sin sesión sigue en 401; los secretos de la pasarela se conservan.

## Por qué la versión de la pasarela no coincide con la de la app

La app (web y escritorio) y la pasarela de archivos se publican por separado. Una versión de la app que no toca la pasarela
(1.7.1.x, 1.7.2, 1.7.2.1) no la vuelve a publicar. En `wrangler deployments list` la última publicación aparecía como «1.7.0»
aunque la app ya iba en 1.7.2.1; eso era correcto, no un atraso.

## Publicación 1.7.5 (10 de noviembre de 2026)

Autorizado por Santiago el 10 de noviembre: migración, rutas de la pasarela, encender el puente y publicar 1.7.5 en el
actualizador de macOS.

1. Migración `20261104010000_workspace_ultramar_bridge.sql` aplicada (aditiva; no borra ni cambia permisos: la huella de la
   matriz de permisos sigue siendo `daf1a89a16b23992e880e63e12d37b23`, 230 filas).
2. Pasarela publicada con `/ultramar/*` (`b49b83d0`). Sin sesión responde 401 `UM030`; los originales siguen igual (401).
3. Puente encendido.
4. Web `271850d` en producción.
5. macOS: compilación nativa [run 42917468996](https://github.com/santiagohzszmex/gba-workspace/actions/runs/42917468996)
   aprobada (Mac Apple Silicon, Mac Intel y Windows); paquetes firmados y verificados con la app instalada (1.7.2.1) y
   publicados como `workspace-v1.7.5-beta.1`. Comprobado después: `latest-darwin.json` = 1.7.5; `latest-windows.json` y
   `latest.json` siguen en 1.6.6.3; la página pública sigue en 1.5.0. El instalador de Windows 1.7.5 quedó como
   candidato en borrador (no publicado).

**No incluido en 1.7.5**: la vista previa con Cuaderna dentro de Workspace que mencionaba el plan
([1.7.5-ultramar-plan.md](workspace/1.7.5-ultramar-plan.md)); sigue pendiente.

## Corrección 1.7.5 (10 de noviembre de 2026)

Primer envío real desde Ultramar: «La edición está cerrada» (UM008) en una edición activa. Causa: la API ejecuta catálogo,
instantánea y original en una transacción de sólo lectura y `require_open_project` usa `SELECT … FOR SHARE`; el puente
convertía ese error en UM008. Corrección `20261110230000_workspace_ultramar_read_only_open_check.sql` (sólo reemplaza
`workspace_private.ultramar_task`): lecturas sin candado; reserva y confirmación con candado, y sólo una edición realmente
cerrada da UM008. Prueba nueva en transacción de sólo lectura (64 comprobaciones del puente). Aplicada con autorización de
Santiago; función de producción idéntica al archivo.

## Ensayo con Ultramar en Mac (10 de noviembre de 2026): aprobado

Edición «Prueba 1.7.5 · Ultramar» (`828e4938…`), asignación «Maquetación de prueba · Ultramar» (Diseño y maquetación).
Preparada para Ultramar → enviada desde Ultramar con la sesión de Santiago → versión 1 en Revisión con `.ultramar`, PDF y PNG
verificados por la pasarela; una sola reserva. La edición de prueba puede cerrarse o eliminarse cuando ya no se necesite.

## Inicio de sesión en workspace.gba.software (10 de noviembre de 2026)

La web en su dominio propio mostraba «Failed to fetch» al entrar: GBA ID (`gba.software/api/gba-id`, repositorio `VISTA`,
proyecto de Vercel `gba-vista-seeitdifferently`) no tenía `https://workspace.gba.software` entre sus orígenes y respondía 403.
Corregido en `VISTA` `47c6e04` (pruebas: el dominio entra y los parecidos siguen rechazados) y publicado con autorización de
Santiago. Comprobado: `workspace.gba.software` recibe permiso; `gba.software` y `vista.gba.software` siguen igual. Ese proyecto
no se publica solo al subir a `main`: hay que desplegarlo.

## Avisos del navegador en workspace.gba.software (10 de noviembre de 2026)

La web pedía la configuración de avisos (`/api/workspace-push`) en su propio dominio, donde no existe (404). `vercel.json`
reenvía sólo esa consulta GET a `gba.software/api/workspace-push`; los POST siguen dando 404 en este dominio. Prueba en
`notification-client`; verificado en vista previa y en producción (`e5dbabf`). El servicio y sus claves siguen en `VISTA`.

## Adelanto de Labradorita (1.8.0) en la base de datos (11 de noviembre de 2026)

Santiago autorizó aplicar en producción la migración `20261111180000_workspace_production_kinds.sql` sin publicar todavía la
web: 1.8.0 no sale aún y sus cambios se juntan en la rama `claude/labradorita-tipos-produccion`.

- Agrega el tipo de producción (`publication` por omisión, o `video`) y las especialidades de video. Las 5 producciones
  existentes quedaron como publicaciones y sus áreas no cambiaron.
- Agrega 18 permisos de aprobación para las áreas de video (Dirección, Dirección de producto y responsable de área, igual que
  en las áreas editoriales): la matriz pasa de 230 a 248 filas. No quita ni cambia ningún permiso existente.
- Envuelve `workspace_command` sólo para `project.create`; la cadena anterior (`command_before_deadlines`) sigue intacta y
  privada. Las 4 funciones nuevas en producción son idénticas al archivo.
- Sin efecto visible: la web y las apps publicadas no envían el tipo, así que siguen creando ediciones como siempre.
- Orden obligatorio: esta migración siempre antes de publicar la web de 1.8.0. Si la web saliera antes, crear un video haría
  una edición normal sin avisar.

## Pendiente

- Windows: Lapislázuli (1.7.x) y Ultramar en Windows.
- 1.8.0 Labradorita: pegado desde Word/Google Docs/Pages, Workspace instalable en el celular, conversación tipo chat en
  cada asignación y producciones de video y animación, juntas en una sola actualización. Plan:
  [1.8.0-plan.md](workspace/1.8.0-plan.md).
