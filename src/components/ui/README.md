# Biblioteca de interfaz de Visual Corp Suite

La biblioteca reúne tokens, componentes y presets de movimiento para que las nuevas pantallas usen una misma base visual. La página de revisión está en **Equipo y sistema → Biblioteca de interfaz** (`/operaciones/equipo/biblioteca-ui`).

## Capas

- `src/app/design-tokens.css`: colores semánticos, espacios, radios, elevaciones, tipografía y duraciones. Los tokens `--vc-*` son la API estable; sus valores semánticos cambian entre los temas claro y oscuro.
- `DesignSystemPrimitives.tsx` y `design-system-primitives.css`: controles de uso general con variantes pequeñas y accesibles.
- `motion-presets.ts`: entradas y salidas cortas para Motion. El `MotionConfig` de la aplicación y los componentes respetan la preferencia de movimiento reducido.
- `MagicComponents.tsx`, `OperationalKit.tsx`, `FormControls.tsx`, `SelectDropdown.tsx`, `AnimatedTabs.tsx` y `Calendar.tsx`: piezas existentes de interacción y operación. Antes de crear una segunda versión, revisa si una de ellas ya resuelve el caso.

## Tokens

Usa nombres por función, por ejemplo `var(--vc-surface)`, `var(--vc-ink)`, `var(--vc-muted)`, `var(--vc-line)`, `var(--vc-brand)` y `var(--vc-focus)`. Evita repetir hexadecimales en componentes nuevos. Para superficies, usa `--vc-surface`, `--vc-surface-raised` o `--vc-surface-soft`; reserva colores primitivos como `--vc-brand-magenta` para construir la paleta.

La fuente de tema es `ThemeProvider` (`src/app/ThemeProvider.tsx`). Dentro de la Suite usa `useTheme()` y no leas ni escribas directamente `localStorage`, `data-theme` o el evento histórico `theme_change`. La página pública mantiene su modo independiente.

## Componentes nuevos

```tsx
import { AuroraField, UiBadge, UiButton, UiSurface, UiTextField } from '../../components/ui';

<UiSurface variant="raised">
  <UiBadge tone="success">Listo</UiBadge>
  <UiTextField label="Nombre" hint="Nombre visible en el panel" />
  <UiButton variant="primary">Guardar</UiButton>
</UiSurface>

<AuroraField>Contenido</AuroraField>
```

`UiButton` expone variantes `primary`, `secondary`, `outline`, `ghost` y `danger`; tamaños `sm`, `md` y `lg`; y estado `loading`. `UiSurface` admite `plain`, `raised`, `subtle` y `glass`. `UiTextField` enlaza label, ayuda y error con el campo. `UiNotice` usa un estado accesible y nunca depende solo del color.

## Responsive y accesibilidad

Las nuevas piezas deben caber con un ancho útil cercano a 950 px, encoger hijos flex/grid con `min-width: 0`, envolver grupos de controles, y llevar tablas dentro de `.table-wrap`. Mantén foco visible, nombres accesibles, contraste de texto y un fallback de fondo sólido si usas desenfoque. Usa `useReducedMotion()` cuando una animación tenga movimiento espacial; no animes información esencial.

Al añadir una variante, documenta su intención, estado claro/oscuro y uso recomendado. Mantén las paletas de estado para éxito, advertencia y error consistentes en toda la Suite.
