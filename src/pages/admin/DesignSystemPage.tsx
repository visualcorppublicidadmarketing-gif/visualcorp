import { useState } from 'react';
import { ArrowUpRight, Check, CircleHelp, Layers3, Moon, Play, Sparkles, Sun } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PageHeading } from '../../app/layout';
import { useTheme } from '../../app/ThemeProvider';
import { AuroraField, UiBadge, UiButton, UiNotice, UiSurface, UiTextField } from '../../components/ui/DesignSystemPrimitives';
import { ThemeSwitcher } from '../../components/ui/ThemeSwitcher';
import { vcMotionPresets, vcMotionTransition } from '../../components/ui/motion-presets';
import './design-system-page.css';

const colorTokens = [
  { name: 'Lienzo', token: '--vc-canvas' },
  { name: 'Superficie', token: '--vc-surface' },
  { name: 'Superficie elevada', token: '--vc-surface-raised' },
  { name: 'Texto', token: '--vc-ink' },
  { name: 'Texto secundario', token: '--vc-muted' },
  { name: 'Marca', token: '--vc-brand' },
  { name: 'Azul', token: '--vc-blue' },
  { name: 'Borde', token: '--vc-line' },
];

export function DesignSystemPage() {
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [motionKey, setMotionKey] = useState(0);

  return (
    <div className="vc-ds-page">
      <PageHeading
        eyebrow="SISTEMA VISUAL · BIBLIOTECA"
        title="Componentes y estilos"
        description="Una referencia compartida para construir pantallas consistentes en Visual Corp Suite."
        action={<ThemeSwitcher theme={theme} onToggle={toggleTheme} variant="capsule" />}
      />

      <AuroraField className="vc-ds-hero">
        <div className="vc-ds-hero-copy">
          <UiBadge tone="brand"><Sparkles size={13} /> Biblioteca viva</UiBadge>
          <h2>Una sola base visual para toda la Suite.</h2>
          <p>Los colores semánticos, controles, superficies y animaciones se comparten desde aquí. Cambia el tema para revisar cómo se adapta cada pieza.</p>
          <div className="vc-ds-hero-actions">
            <UiButton onClick={toggleTheme} variant="primary">{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} Probar modo {theme === 'dark' ? 'claro' : 'oscuro'}</UiButton>
            <span className="vc-ds-current-theme"><span className="vc-ds-theme-dot" /> Tema activo: <strong>{theme === 'dark' ? 'Oscuro' : 'Claro'}</strong></span>
          </div>
        </div>
        <div className="vc-ds-hero-art" aria-hidden="true">
          <span className="vc-ds-orbit orbit-one" /><span className="vc-ds-orbit orbit-two" />
          <div className="vc-ds-hero-mark"><Layers3 size={29} /><span>VC</span></div>
        </div>
      </AuroraField>

      <section className="vc-ds-section" aria-labelledby="vc-ds-colors-title">
        <div className="vc-ds-section-heading"><div><span className="vc-ds-kicker">01 · FUNDAMENTOS</span><h2 id="vc-ds-colors-title">Colores semánticos</h2></div><p>Usa el propósito del color, no un valor aislado. Los tokens cambian automáticamente entre temas.</p></div>
        <div className="vc-ds-color-grid">
          {colorTokens.map(({ name, token }) => <div className="vc-ds-color-token" key={token}><span className="vc-ds-swatch" style={{ background: `var(${token})` }} /><span><strong>{name}</strong><code>{token}</code></span></div>)}
        </div>
      </section>

      <div className="vc-ds-grid">
        <section className="vc-ds-section" aria-labelledby="vc-ds-controls-title">
          <div className="vc-ds-section-heading"><div><span className="vc-ds-kicker">02 · INTERACCIÓN</span><h2 id="vc-ds-controls-title">Botones y estados</h2></div></div>
          <UiSurface variant="raised" className="vc-ds-showcase">
            <div className="vc-ds-button-row"><UiButton><Check size={15} /> Primario</UiButton><UiButton variant="secondary">Secundario</UiButton></div>
            <div className="vc-ds-button-row"><UiButton variant="outline">Contorno</UiButton><UiButton variant="ghost">Discreto</UiButton><UiButton variant="danger">Peligro</UiButton></div>
            <div className="vc-ds-button-row"><UiButton size="sm">Pequeño</UiButton><UiButton size="lg">Grande</UiButton><UiButton loading>Cargando</UiButton></div>
            <div className="vc-ds-badge-row"><UiBadge tone="neutral">Borrador</UiBadge><UiBadge tone="brand">Visual Corp</UiBadge><UiBadge tone="info">En revisión</UiBadge><UiBadge tone="success">Listo</UiBadge><UiBadge tone="warning">Pendiente</UiBadge><UiBadge tone="danger">Requiere atención</UiBadge></div>
          </UiSurface>
        </section>

        <section className="vc-ds-section" aria-labelledby="vc-ds-fields-title">
          <div className="vc-ds-section-heading"><div><span className="vc-ds-kicker">03 · FORMULARIOS</span><h2 id="vc-ds-fields-title">Campos accesibles</h2></div></div>
          <UiSurface variant="raised" className="vc-ds-showcase vc-ds-form-sample">
            <UiTextField label="Nombre de la vista" placeholder="Ej. Resumen semanal" hint="El texto de ayuda se asocia al campo para lectores de pantalla." />
            <UiTextField label="Correo de contacto" type="email" placeholder="nombre@empresa.com" required />
            <UiTextField label="Código de referencia" defaultValue="VC-1042" error="Este código ya está en uso." />
          </UiSurface>
        </section>
      </div>

      <section className="vc-ds-section" aria-labelledby="vc-ds-surfaces-title">
        <div className="vc-ds-section-heading"><div><span className="vc-ds-kicker">04 · CAPAS Y EFECTOS</span><h2 id="vc-ds-surfaces-title">Superficies, glass y avisos</h2></div><p>El cristal es una variante puntual sobre colores del tema, con alternativa de fondo sólida.</p></div>
        <div className="vc-ds-surface-grid">
          <UiSurface variant="plain" className="vc-ds-surface-card"><span className="vc-ds-surface-icon"><Layers3 size={16} /></span><h3>Base</h3><p>Para contenido agrupado sin sombra marcada.</p><code>variant="plain"</code></UiSurface>
          <UiSurface variant="raised" className="vc-ds-surface-card"><span className="vc-ds-surface-icon"><ArrowUpRight size={16} /></span><h3>Elevada</h3><p>Para módulos que necesitan separarse del lienzo.</p><code>variant="raised"</code></UiSurface>
          <AuroraField className="vc-ds-surface-card vc-ds-glass-card"><span className="vc-ds-surface-icon"><Sparkles size={16} /></span><h3>Aurora glass</h3><p>Desenfoque translúcido con halo magenta y azul adaptable al tema.</p><code>variant="glass" + AuroraField</code></AuroraField>
        </div>
        <div className="vc-ds-notice-grid">
          <UiNotice tone="info" icon={<CircleHelp size={16} />} title="Información">Mantén el mensaje breve y añade una acción solo cuando haga falta.</UiNotice>
          <UiNotice tone="success" icon={<Check size={16} />} title="Cambios guardados">Los avisos comunican el estado con texto además del color.</UiNotice>
        </div>
      </section>

      <section className="vc-ds-section" aria-labelledby="vc-ds-motion-title">
        <div className="vc-ds-section-heading"><div><span className="vc-ds-kicker">05 · MOVIMIENTO</span><h2 id="vc-ds-motion-title">Animaciones reutilizables</h2></div><p>Entradas cortas y sutiles. La preferencia de movimiento reducido se respeta en la página.</p></div>
        <UiSurface variant="raised" className="vc-ds-motion-showcase">
          <div className="vc-ds-motion-copy"><UiBadge tone="info">Motion</UiBadge><h3>Entrada suave</h3><p>Preset <code>fadeUp</code> con transición de 240 ms y desplazamiento corto.</p><UiButton variant="outline" onClick={() => setMotionKey((key) => key + 1)}><Play size={14} /> Reproducir</UiButton></div>
          <div className="vc-ds-motion-stage" aria-live="polite">
            <motion.div key={motionKey} className="vc-ds-motion-card" initial={reduceMotion ? false : vcMotionPresets.fadeUp.initial} animate={vcMotionPresets.fadeUp.animate} transition={reduceMotion ? { duration: 0 } : vcMotionTransition}>
              <span className="vc-ds-motion-card-icon"><Sparkles size={17} /></span><strong>Contenido</strong><small>{reduceMotion ? 'Movimiento reducido activo' : 'Aparece con suavidad'}</small>
            </motion.div>
          </div>
        </UiSurface>
      </section>

      <footer className="vc-ds-footer"><span><Layers3 size={15} /> Biblioteca base de Visual Corp Suite</span><span>Componentes tipados · tokens por tema · responsive</span></footer>
    </div>
  );
}
