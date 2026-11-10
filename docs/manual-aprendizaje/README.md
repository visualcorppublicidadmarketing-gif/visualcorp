# Manual / aprendizaje

Biblioteca interna de la Suite para consultar formación y practicar herramientas desde **Operaciones → Equipo y sistema → Aprendizaje** o **Administración → Manual/aprendizaje**. La experiencia nativa organiza áreas, guías y prácticas como páginas React; las lecturas se marcan en el navegador.

## Cobertura del manual fuente

La biblioteca reúne nueve guías (Inducción, Seguridad Industrial, Fundamentos gráficos, Asesores, Diseñadores, Impresores, Corte Láser, Taller y Marketing), seis mini aplicaciones (Calculadora de áreas, Distancia Visual, Catálogo Pantone, Color Match, Trivia y Checklist Preimpresión) y el folleto PDF. La búsqueda considera título, descripción, área y términos relacionados; los filtros permiten explorar por tema.

Las guías, listas, preguntas y colores de la experiencia nativa no se importan desde el cliente. La app los pide a `GET /api/learning-content?resource=library|quiz|pantone`, enviando la sesión Supabase. El endpoint vuelve a verificar el token y el rol con `get_my_visualcorp_access`; solo después entrega el recurso y envía `Cache-Control: private, no-store`. Las listas de apoyo y avances se guardan localmente en el navegador. Los cálculos no inventan precios, y las referencias de color o distancia no sustituyen una prueba física ni los procedimientos vigentes.

Los 43 archivos fuente siguen en `public/manual-aprendizaje/fuente/` por procedencia. El middleware de Vercel comprueba sesión y rol interno para las solicitudes en el sitio y evita caché compartida, pero esos archivos también aparecen en el historial del repositorio público. El control del sitio no revoca las copias de GitHub ni del repositorio fuente público.

## Copia de referencia

- Origen: `E:\CODE\VisualCorp-Manual`.
- Corte local: 2026-10-26. En la captura, `master` estaba en `251ece9` (`feat(apps): Añade Catálogo Pantone (>700 colores), mejora Trivia y corrige UI/UX`) y había cambios locales en `index.html`, `css/manual.css` y un `CLAUDE.md` sin seguimiento. Se copió el contenido actual de esos archivos, junto con los demás recursos; el repositorio `.git` y las instrucciones de Claude no se duplicaron.
- Contenido preservado: 43 archivos, 15,565,408 bytes. La copia se comparó con el origen archivo por archivo mediante SHA-256; no hubo archivos faltantes, sobrantes o distintos.
- Copia de referencia para esta integración: `public/manual-aprendizaje/fuente/`.

Para refrescar la biblioteca tras cambios del manual, vuelve a copiar sus páginas, `css/`, `js/`, `img/` y `PDF/` en esa carpeta y actualiza este registro con la fecha y la verificación de integridad.

## Implementación

- Página React/Vite en `src/pages/learning/ManualLearningPage.tsx`, prácticas en `LearningTools.tsx` y estilos responsive en `manual-learning.css`. Las rutas conservan la protección existente de Operaciones y Administración.
- `api/learning-content.ts` usa la sesión Bearer para consultar `get_my_visualcorp_access` y solo devuelve los recursos permitidos. Los datos que alimentan los módulos se mantienen en `server/learning/`; no entran en los chunks Vite del navegador. Las respuestas no se guardan en caché compartida.
- El middleware de `/manual-aprendizaje/fuente/*` se mantiene. Comprueba la cookie de sesión limitada a esa ruta y el rol interno; AuthProvider la renueva durante una sesión activa y caduca en un máximo de dos minutos.
- La validación local incluye pruebas de autorización del endpoint, acceso de perfiles, recursos, navegación con flechas/Home/End y una comprobación del build que falla si aparecen textos de guía, preguntas, listas o colores en los chunks públicos.
- **Límite de procedencia:** `visualcorppublicidadmarketing-gif/visualcorp` y `estebanico10/VisualCorp-Manual` son repositorios públicos. Los archivos fuente históricos siguen accesibles desde esos repositorios; el middleware protege las rutas desplegadas, no las copias públicas. Los datos nuevos bajo `server/learning/` también formarían parte del código fuente si esta worktree se sube al repositorio. Mantenerlos fuera de Git requiere moverlos a una fuente privada (por ejemplo, Supabase con RLS) antes de publicar cambios en el repositorio público.
