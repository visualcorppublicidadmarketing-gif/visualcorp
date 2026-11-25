import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { MonogramGenerator } from '../../features/tools/monogram-generator/MonogramGenerator';

export function MonogramGeneratorPage() {
  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="HERRAMIENTAS · DISEÑO PARAMÉTRICO"
        title="Monogramas 2D y 3D"
        description="Combina capas tipográficas, ajusta medidas y revisa su extrusión antes de exportar el vector."
        action={<Link to="/operaciones/herramientas" className="button button-outline"><ArrowLeft size={15} /> Herramientas</Link>}
      />
      <MonogramGenerator />
    </AppFrame>
  );
}
