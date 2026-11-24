# Publicación de catálogo en Telegram

## Canales y contenido

- **Público:** `Visual Corp · Productos` (`@visualcorp_catalogo`). Publica fotos, nombre, descripción, SKU y enlace al producto. No envía precios ni editables.
- **Interno:** `Visual Corp · Catálogo estándar (interno)`. Publica fotos, nombre, SKU, especificaciones y precios. Adjunta AI/PSD guardados en el espacio privado del producto, además de QR y Code 128.
- La ficha del sitio sigue siendo el origen de los datos. El paquete interno contiene los masters solo al generarse con un perfil autorizado.
- Cada destino tiene una confirmación propia y un historial por versión del producto. Los envíos inciertos quedan bloqueados para revisión manual; no se repiten automáticamente.
- La Edge Function no recibe secretos desde el navegador. La consulta de conexión no envía mensajes.

## Activación inicial

1. En Telegram, crea un bot con [@BotFather](https://t.me/BotFather) y conserva el token fuera del chat y del repositorio.
2. Añade el bot como administrador de ambos canales y habilita el permiso para publicar mensajes.
3. En Supabase, abre el proyecto `visualcorp-suite` y entra en **Edge Functions → Secrets**. Agrega `TELEGRAM_BOT_TOKEN`. El destino público puede usar `@visualcorp_catalogo`; para sustituirlo, guarda `TELEGRAM_PUBLIC_CHANNEL_ID`.
4. Abre una ficha de producto estándar y pulsa **Detectar ID del canal privado**. La herramienta consulta las actualizaciones del bot, sin publicar. Copia el ID detectado.
5. Agrega `TELEGRAM_INTERNAL_CHANNEL_ID` en los secretos de Supabase con ese ID numérico. El formulario de publicación no muestra ni guarda el token.
6. Vuelve a la ficha y actualiza el estado de conexión. La función revisa que el bot exista, encuentre cada canal y tenga permisos de administrador para publicar.

Si no aparece el canal privado, confirma que el bot ya sea administrador y vuelve a consultar. Si la API indica que hay un webhook configurado, `getUpdates` no se puede usar mientras ese webhook siga activo.

## Paquetes

- **Paquete público:** fotos públicas del catálogo, ficha sin precios, PNG del QR que apunta a `/tienda?producto={slug}` y PNG Code 128 con el SKU.
- **Paquete interno:** lo anterior, precios, especificaciones y AI/PSD del bucket privado.
- Los editables aceptados son `.ai` y `.psd`, con un máximo de 45 MiB por archivo y 10 archivos por producto.
- Generar códigos y comprimir ZIP se hace en el navegador. El QR usa `qrcode` y el ZIP usa `fflate`; ambos están publicados bajo licencia MIT. Code 128 reutiliza la dependencia existente `jsbarcode`.
- El canal público utiliza hasta cinco fotos convertidas a JPEG en el navegador. Las imágenes transformadas solo se incluyen en la solicitud de Telegram; no se guardan como copias adicionales.

## Costos y límites

La integración usa el proyecto Supabase Free existente y la Bot API normal de Telegram. No crea otro proyecto, hosting, servicio de imágenes ni suscripción. Los archivos privados y llamadas quedan sujetos a los límites incluidos en los planes actuales; conviene no cargar masters que no se necesiten. La publicación depende de que el sitio y Supabase sigan operativos.

## Secretos configurables

| Secreto | Requerido | Uso |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Sí | Autenticación del bot, solo en Edge Functions Secrets |
| `TELEGRAM_INTERNAL_CHANNEL_ID` | Sí | ID numérico del canal privado |
| `TELEGRAM_PUBLIC_CHANNEL_ID` | No | Reemplaza el valor público `@visualcorp_catalogo` |

La función utiliza además `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` provistos por Supabase. No los copies en variables Vite ni en el frontend.

## Seguridad y permisos

- Los masters se guardan en `catalog-product-editables`, un bucket privado separado de las fotos públicas.
- El acceso a masters requiere `catalog_admin.edit`. Publicar al público requiere que el producto esté publicado y el usuario tenga `website.publish_content`. Publicar internamente requiere permisos de catálogo para editar y modificar precios.
- La Edge Function verifica el JWT, vuelve a comprobar el permiso del usuario en Postgres y solo luego usa las credenciales de servicio para leer el producto o los archivos.
- El historial almacena destino, estado, enlaces de mensajes y progreso; no copia ni expone precios en los registros públicos.
