import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { VectorModelStudio } from '../../features/tools/vector-model/VectorModelStudio';

export function VectorModelPage() {
  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="HERRAMIENTAS · VECTOR A MODELO"
        title="Modelo vectorial 2D y 3D"
        description="Importa un SVG, ajusta las piezas y guarda un modelo configurable que puedes volver a abrir."
        action={<Link to="/operaciones/herramientas" className="button button-outline"><ArrowLeft size={15} /> Herramientas</Link>}
      />
      <VectorModelStudio />
    </AppFrame>
  );
}
