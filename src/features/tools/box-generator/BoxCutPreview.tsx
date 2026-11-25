import { useMemo } from 'react';
import { buildBoxCutLayout } from './boxModel';
import type { BoxCutLayout, BoxProject } from './boxModel';

interface BoxCutPreviewProps {
  project: BoxProject;
  sheetLayout?: BoxCutLayout;
  sheetNumber?: number;
}

function outlinePath(points: Array<{ x: number; y: number }>, offsetX: number, offsetY: number) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x + offsetX).toFixed(3)} ${(point.y + offsetY).toFixed(3)}`).join(' ') + ' Z';
}

export function BoxCutPreview({ project, sheetLayout, sheetNumber }: BoxCutPreviewProps) {
  const defaultLayout = useMemo(() => buildBoxCutLayout(project), [project]);
  const layout = sheetLayout ?? defaultLayout;
  const padding = Math.max(8, project.thicknessMm * 2);
  const width = Math.max(1, layout.width + padding * 2);
  const height = Math.max(1, layout.height + padding * 2);

  return (
    <div className="box-generator__flat-stage">
      <svg
        className="box-generator__flat-plan"
        viewBox={`-${padding} -${padding} ${width} ${height}`}
        role="img"
        aria-label={`${sheetNumber ? `Hoja ${sheetNumber}` : 'Plano de corte'} con ${layout.panels.length} piezas para una caja ${project.jointStyle === 'finger' ? 'con dedos' : 'de unión plana'}`}
      >
        {layout.panels.map(({ panel, x, y, points }) => (
          <g key={panel.id}>
            <path className="box-generator__cut-line" d={outlinePath(points, x, y)} />
            {project.includePartLabels && (
              <text className="box-generator__part-label" x={x + panel.width / 2} y={y + panel.height / 2} textAnchor="middle" dominantBaseline="middle">
                {panel.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="box-generator__flat-footer">
        <span><i className="box-generator__legend-dot" aria-hidden="true" /> Línea de corte</span>
        <span>{sheetNumber ? `Hoja ${sheetNumber} · ` : ''}{layout.panels.length} piezas · unidades del archivo: mm</span>
      </div>
    </div>
  );
}
