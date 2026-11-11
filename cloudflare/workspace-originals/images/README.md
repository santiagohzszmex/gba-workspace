# Lapislázuli · pasarela preparada, no desplegada

Fase 2 añade rutas al Worker actual. No es una app nueva ni una pantalla de entregas. Las vistas finales pertenecen a Mi trabajo, Asignaciones y Revisión **dentro de la edición elegida**. El flag de servidor permanece desactivado.

## Contrato para herramientas de desarrollo

Toda operación de subida requiere `Authorization: Bearer <sesión GBA ID>`. No acepta tokens del conector como si fueran JWT. El secreto de pasarela se usa solo entre Worker y Supabase. Nunca se entrega al cliente.

| Ruta | Función |
|---|---|
| `POST /images/uploads` | JSON `{request_id,deliverable_id,file_name,role,format,size_bytes,sha256}`. UUID de solicitud persistente; devuelve sesión segura e identificador del activo. |
| `GET /images/uploads/:id` | Estado, partes confirmadas y bytes recibidos; sin claves de R2, ETags ni leases. |
| `PUT /images/uploads/:id/parts/:n` | Bytes de una parte. Tamaño desde la sesión: 8 MiB salvo la última. Hash y tamaño calculados en servidor. |
| `POST /images/uploads/:id/complete` | Completa multipart, lee/hashea el original real y valida su formato. Validado significa integridad/formato, **no aprobación editorial**. |
| `DELETE /images/uploads/:id` | Cancela una sesión pendiente. No elimina originales que ya quedaron guardados. |
| `POST /images/files/:asset/(original\|preview\|thumbnail)/link` | Obtiene enlace firmado de hasta 300 s o el mensaje de preview no disponible. |
| `GET /image-downloads/:asset/:operation?token=…` | Canje ligado al archivo exacto, operación, persona y sesión. Revalida acceso actual. Original como adjunto; derivados WebP. |

`src/workspace/imageUploadClient.mjs` es el adaptador sin interfaz. `prepare` recibe el `File` y la identidad/tarea; `upload` recibe su manifiesto persistido y el mismo archivo; `cancel` es explícito. El persistidor guarda identificadores, hash y progreso, **no credenciales ni bytes**. Al reiniciar, recuperar el manifiesto de esa cuenta y volver a seleccionar el original. Cortar la red pausa; no cancela ni libera cuota. Puede repetirse una parte cuyo acuse se perdió, sin doble reserva. `hashFile` debe usar lectura incremental o una implementación nativa para archivos grandes; el hash del cliente nunca sustituye la verificación del servidor.

## Procesador reemplazable

`processorFactory(env)` entrega `{id, generate({asset, policy, source})}`. `source()` abre un stream privado de R2. Devuelve exactamente `thumbnail` y `preview`: `{kind,body,width,height,metadata_stripped:true}`. La pasarela reserva bytes de cada derivado antes de escribirlo, comprueba su huella y confirma su registro. El procesador actual limita salida a la política, elimina EXIF/XMP, conserva alfa/perfil y rechaza un cambio de proporción. Original y procesamiento tienen estados separados.

No hay original público ni transformación basada en un URL remoto. Una vista previa que falla mantiene el original validado: **«Vista previa no disponible; descarga el original»**. Los PNG con datos de animación conservan el raster PNG base validado; no se ejecuta ni certifica la animación, y el procesador devuelve fallback para evitar una preview de otro fotograma.

## Limpieza y cuotas

La sesión reserva el original una sola vez, caduca a las 24 h y conserva su tamaño de parte inicial. Un lease evita operaciones concurrentes; al caducar permite recuperación. Cron preparado cada 15 minutos: hasta cinco sesiones y un derivado huérfano por pasada, más un trabajo de preview pendiente. Si hay cola o R2 falla, el espacio sigue reservado. Las partes se abortan y el objeto se borra; solo tras respuesta de borrado y `HEAD` ausente se confirma la liberación idempotente en SQL. Se registra el actor real o acción automática con actor nulo; nunca se suplanta al autor.

Las versiones enviadas no entran en limpieza. **No hay borrado de borradores de 60/90 días.** Los originales guardados sin enviar conservan su cuota hasta definir su retención. La tabla de política mantiene 10 GB de cuota compartida a través de `original_limits`, límites de archivo y avisos al 80 %. Los presupuestos operativos existentes también se cargan conservadoramente: cada finalización reserva 32 lecturas para inspección acotada. La limpieza necesaria se permite aunque ese presupuesto se agote. Son barreras de aplicación, no una lectura de facturación global de Cloudflare.

Las tablas nuevas son privadas y las funciones de mantenimiento exigen el secreto incluso al rol `anon`. Los enlaces canjeados sin JWT usan evaluadores privados con usuario explícito, tras verificar la sesión en `auth.sessions`; no modifican JWT ni amplían las funciones generales de permisos. Se desactivan logs de invocación/trazas y se redactan parámetros de consulta para proteger los enlaces firmados. Los errores propios no registran nombres, tokens, claves ni bytes.

Pruebas: `npm run test:workspace`, `npm run test:r2-runtime`, `npm run r2:check` (solo compilación). El test R2 usa workerd y bucket local; el test SQL usa PGlite sin registros de producción.

## Cambio de Fase 3 (local, sin desplegar)

El visor usa el PNG original. `upload_policy.derivatives_enabled=false` y el binding `IMAGES` queda comentado: las tablas, el procesador reemplazable y sus pruebas se conservan sin generar derivados. La validación activa del PNG es firma/IHDR/IEND, dimensiones, tamaño y SHA-256 nativo; no decodifica ni certifica el raster. El cliente informa decodificación, transparencia y perfil como avisos orientativos, asociados al hash enviado. El original conserva EXIF/GPS; la interfaz no interpreta ni muestra esos campos.

`GET /image-downloads/:asset/original` admite un único `Range: bytes=inicio-fin` (206, Content-Range, Accept-Ranges); rangos inválidos devuelven 416. Cada canje revalida permisos. El cliente renueva el enlace al reintentar y verifica el SHA del original completo. La caché separada por cuenta requiere autorización incluso para un acierto; se limpia al cerrar sesión. En escritorio, cuatro comandos IPC con claves cuenta/hash guardan bytes en la caché de la app (máximo descartable 512 MiB por cuenta); no exponen rutas arbitrarias.

La migración `20261016203609_workspace_lapis_image_interface.sql` conserva `images_enabled` desactivado, añade el bundle seguro y avisos inmutables, ancla menciones a nota/versión y pospone la inclusión de imágenes en Documentos a Fase 6. No se debe revertir a la antigua restricción de raster decodificado sobre activos ya aceptados con verificación `header`. Para detener el uso, desactivar imágenes y derivados, conservar los datos y la limpieza de sesiones de Fase 2. No hay DDL destructivo de reversión.

## Video (Labradorita 1.8.0, local, sin desplegar)

Las copias de revisión de video usan estas mismas rutas con `role: "video"` y `format: "mp4"`. Al completar, la pasarela
lee sólo las cabeceras de las cajas y el índice `moov` (`mp4.mjs`) y envía tamaño, duración y formatos a la base de datos,
que aplica los límites vigentes (720p, 10 minutos, 300 MB, H.264). No se relee el archivo completo: las partes ya se
hashearon en el servidor al recibirlas y la huella completa queda como declaración del cliente (`sha256_source`).
Reproducción: `POST /images/files/:asset/stream/link` y `GET /image-downloads/:asset/stream?token=…` con rangos, en línea.
El cron borra las copias viejas programadas después de publicar (`video.purge.claim` / `video.purge.confirm`); si la base de
datos todavía no tiene la migración de video, ese paso se omite sin afectar la limpieza de imágenes.
