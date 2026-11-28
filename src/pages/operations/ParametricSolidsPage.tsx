import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { ParametricSolidsStudio } from '../../features/tools/parametric-solids/ParametricSolidsStudio';

export function ParametricSolidsPage() {
  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="HERRAMIENTAS · MODELADO 3D"
        title="Sólidos paramétricos"
        description="Compón sólidos, aplica vaciados y edita cada pieza desde sus medidas y transformaciones."
        action={<Link to="/operaciones/herramientas" className="button button-outline"><ArrowLeft size={15} /> Herramientas</Link>}
      />
      <ParametricSolidsStudio />
    </AppFrame>
  );
}

