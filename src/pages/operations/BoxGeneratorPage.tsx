import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { BoxGenerator } from '../../features/tools/box-generator/BoxGenerator';

export function BoxGeneratorPage() {
  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="HERRAMIENTAS · DISEÑO PARA CORTE"
        title="Generador de cajas"
        description="Ajusta las medidas y revisa el modelo antes de descargar los vectores."
        action={<Link to="/operaciones/herramientas" className="button button-outline"><ArrowLeft size={15} /> Herramientas</Link>}
      />
      <BoxGenerator />
    </AppFrame>
  );
}
