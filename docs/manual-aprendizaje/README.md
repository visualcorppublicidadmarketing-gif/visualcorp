# Manual / aprendizaje

Biblioteca interna añadida a la Suite para consultar formación y practicar herramientas desde **Operaciones → Aprendizaje** o **Administración → Administración → Manual/aprendizaje**. Ambas rutas reutilizan la sesión y el control de acceso existente. Las páginas React quedan protegidas por el inicio de sesión, pero los 43 archivos fuente servidos desde `public/manual-aprendizaje/fuente/` tienen URL directa y son accesibles públicamente al conocerla. No se deben copiar allí secretos ni datos personales.

## Cobertura del manual fuente

La biblioteca reúne nueve guías (Inducción, Seguridad Industrial, Fundamentos gráficos, Asesores, Diseñadores, Impresores, Corte Láser, Taller y Marketing), seis mini aplicaciones (Calculadora de áreas, Distancia Visual, Catálogo Pantone, Color Match, Trivia y Checklist Preimpresión) y el folleto PDF. La búsqueda considera título, descripción, área y términos relacionados; los filtros permiten explorar por tema.

Las guías y herramientas se abren dentro del espacio de trabajo para conservar su contenido, recursos e interacciones originales. El botón **Abrir aparte** permite consultar la versión fuente completa. Las solicitudes a `/manual-aprendizaje/fuente/*` pasan por el middleware de Vercel, que comprueba una sesión vigente y un rol interno mediante `get_my_visualcorp_access`; las respuestas usan `Cache-Control: private, no-store`. El catálogo no altera precios ni convierte las referencias del manual en datos comerciales confirmados. Las guías de seguridad se presentan como material de consulta del equipo.

## Copia de referencia

- Origen: `E:\CODE\VisualCorp-Manual`.
- Corte local: 2026-10-26. En la captura, `master` estaba en `251ece9` (`feat(apps): Añade Catálogo Pantone (>700 colores), mejora Trivia y corrige UI/UX`) y había cambios locales en `index.html`, `css/manual.css` y un `CLAUDE.md` sin seguimiento. Se copió el contenido actual de esos archivos, junto con los demás recursos; el repositorio `.git` y las instrucciones de Claude no se duplicaron.
- Contenido preservado: 43 archivos, 15,565,408 bytes. La copia se comparó con el origen archivo por archivo mediante SHA-256; no hubo archivos faltantes, sobrantes o distintos.
- Copia de referencia para esta integración: `public/manual-aprendizaje/fuente/`.

Para refrescar la biblioteca tras cambios del manual, vuelve a copiar sus páginas, `css/`, `js/`, `img/` y `PDF/` en esa carpeta y actualiza este registro con la fecha y la verificación de integridad.

## Implementación

- Página React/Vite en `src/pages/learning/ManualLearningPage.tsx`, estilos responsive en `manual-learning.css` y dos rutas protegidas del área correspondiente.
- Usa `motion`, Lucide y utilidades Tailwind con prefijo `mltw:`. Tailwind se limita a utilidades de la sección; no carga Preflight ni modifica los estilos globales existentes. Reduce animaciones con `prefers-reduced-motion`.
- El middleware niega solicitudes anónimas y perfiles sin rol interno. La cookie de sesión se limita al directorio del manual, se renueva durante una sesión activa y caduca en un máximo de dos minutos. Para validar acceso tras cada cambio, probar rutas sin cookie, con rol autorizado y con rol sin acceso en el preview de Vercel.
- **Límite de procedencia:** el repositorio `visualcorppublicidadmarketing-gif/visualcorp` es público y el manual también está en `estebanico10/VisualCorp-Manual`, público. La copia quedó en el historial público al integrar PR #96; este middleware protege el sitio desplegado, pero no elimina ese historial ni las copias públicas ya existentes. La exposición por GitHub requiere una acción de saneamiento independiente.
