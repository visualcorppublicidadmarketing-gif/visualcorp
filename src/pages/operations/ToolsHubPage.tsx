import { ArrowUpRight, Box, Layers3, Type, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import './tools-hub-page.css';

export function ToolsHubPage() {
  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="CENTRO DE UTILIDADES"
        title="Herramientas"
        description="Utilidades internas de diseño y producción reunidas en un solo lugar."
      />
      <section className="tools-hub" aria-label="Herramientas disponibles">
        <div className="tools-hub__intro">
          <div><span className="tools-hub__intro-icon"><Wrench size={18} aria-hidden="true" /></span><p>Utilidades internas para preparar modelos, planos y recursos de producción.</p></div>
          <span className="tools-hub__count">3 disponibles</span>
        </div>
        <div className="tools-hub__grid">
          <Link className="tools-hub__card" to="/operaciones/herramientas/generador-cajas">
            <div className="tools-hub__card-art" aria-hidden="true">
              <div className="tools-hub__art-grid" />
              <div className="tools-hub__box-drawing"><Box size={76} strokeWidth={1.05} /></div>
              <span className="tools-hub__art-tag"><Layers3 size={12} /> 3D + SVG + DXF</span>
            </div>
            <div className="tools-hub__card-content">
              <div><span className="tools-hub__status"><i /> Disponible</span><h2>Generador de cajas</h2><p>Define medidas, grosor y tipo de ensamble; revisa el modelo y descarga el plano vectorial.</p></div>
              <span className="tools-hub__open"><span>Abrir herramienta</span><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
          </Link>
          <Link className="tools-hub__card" to="/operaciones/herramientas/monogramas">
            <div className="tools-hub__card-art tools-hub__card-art--monogram" aria-hidden="true">
              <div className="tools-hub__art-grid" />
              <span className="tools-hub__monogram-glyph">A<span>María</span></span>
              <span className="tools-hub__art-tag"><Type size={12} /> 3D + SVG + JSON</span>
            </div>
            <div className="tools-hub__card-content">
              <div><span className="tools-hub__status"><i /> Disponible · V1</span><h2>Editor de monogramas</h2><p>Combina textos independientes, colócalos en el editor 2D y previsualiza la extrusión 3D.</p></div>
              <span className="tools-hub__open"><span>Abrir herramienta</span><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
          </Link>
          <Link className="tools-hub__card" to="/operaciones/herramientas/vector-modelo">
            <div className="tools-hub__card-art tools-hub__card-art--vector" aria-hidden="true">
              <div className="tools-hub__art-grid" />
              <div className="tools-hub__vector-glyph"><Layers3 size={72} strokeWidth={1.1} /></div>
              <span className="tools-hub__art-tag"><Layers3 size={12} /> SVG → JSON + 3D</span>
            </div>
            <div className="tools-hub__card-content">
              <div><span className="tools-hub__status"><i /> Disponible · V1</span><h2>Importador vectorial</h2><p>Configura un SVG por capas, define medidas y revisa su extrusión antes de guardar el JSON del modelo.</p></div>
              <span className="tools-hub__open"><span>Abrir herramienta</span><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
          </Link>
        </div>
      </section>
    </AppFrame>
  );
}
