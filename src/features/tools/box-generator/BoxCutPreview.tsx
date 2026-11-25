import { useId, useMemo } from 'react';
import { boxModelLabels, boxPanelArtworkPlacement, buildBoxCutLayout } from './boxModel';
import type { BoxCutLayout, BoxPanelPlacement, BoxProject } from './boxModel';
import { offsetBoxLayout } from './boxKerf';

interface BoxCutPreviewProps {
  project: BoxProject;
  sheetLayout?: BoxCutLayout;
  sheetNumber?: number;
}

function outlinePath(points: Array<{ x: number; y: number }>, offsetX: number, offsetY: number) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x + offsetX).toFixed(3)} ${(point.y + offsetY).toFixed(3)}`).join(' ') + ' Z';
}

export function BoxCutPreview({ project, sheetLayout, sheetNumber }: BoxCutPreviewProps) {
  const id = useId().replaceAll(':', '');
  const preview = useMemo(() => {
    try {
      const source = sheetLayout ?? buildBoxCutLayout(project);
      return { layout: offsetBoxLayout(source, project.camProfile.kerfMm ?? 0, !sheetLayout), error: '' };
    } catch (error) {
      return { layout: null, error: error instanceof Error ? error.message : 'No se pudo generar la ruta compensada.' };
    }
  }, [project, sheetLayout]);
  const layout = preview.layout;
  if (!layout) return <div className="box-generator__sheet-empty" role="alert">{preview.error}</div>;
  const maxThickness = Math.max(project.thicknessMm, ...layout.panels.map(({ panel }) => panel.thicknessMm));
  const padding = Math.max(8, maxThickness * 2);
  const width = Math.max(1, layout.width + padding * 2);
  const height = Math.max(1, layout.height + padding * 2);
  const panelPath = (placement: BoxPanelPlacement) => outlinePath(placement.points, placement.x, placement.y);

  return (
    <div className="box-generator__flat-stage">
      <svg
        className="box-generator__flat-plan"
        viewBox={`-${padding} -${padding} ${width} ${height}`}
        role="img"
        aria-label={`${sheetNumber ? `Hoja ${sheetNumber} · ` : ''}Plano de ${boxModelLabels[project.modelType]} con ${layout.panels.length} piezas; unión ${project.jointStyle === 'finger' ? 'por dedos' : 'plana'}`}
      >
        {sheetNumber && project.sheetSpec && (
          <g aria-label="Límites de plancha y área útil">
            <rect className="box-generator__sheet-boundary" x="0" y="0" width={layout.width} height={layout.height} />
            <rect
              className="box-generator__sheet-usable-area"
              x={project.sheetSpec.marginMm}
              y={project.sheetSpec.marginMm}
              width={Math.max(0, layout.width - project.sheetSpec.marginMm * 2)}
              height={Math.max(0, layout.height - project.sheetSpec.marginMm * 2)}
            />
          </g>
        )}
        {layout.panels.map((placement) => {
          const { panel, x, y, points, cutPoints } = placement;
          const artwork = project.artworkByPanel[panel.id];
          const artworkBox = artwork ? boxPanelArtworkPlacement(placement, artwork) : null;
          const clipId = `box-art-${id}-${panel.id}`;
          return (
            <g key={panel.id}>
              {artwork && artworkBox && (
                <>
                  <defs><clipPath id={clipId}><path d={panelPath(placement)} /></clipPath></defs>
                  <image
                    className="box-generator__artwork-preview"
                    href={artwork.dataUrl}
                    x={artworkBox.x}
                    y={artworkBox.y}
                    width={artworkBox.width}
                    height={artworkBox.height}
                    transform={artworkBox.transform}
                    preserveAspectRatio="none"
                    clipPath={`url(#${clipId})`}
                  />
                </>
              )}
              <path className="box-generator__cut-line" d={outlinePath(cutPoints ?? points, x, y)} />
              {project.includePartLabels && (
                <text className="box-generator__part-label" x={x + (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2} y={y + (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2} textAnchor="middle" dominantBaseline="middle">
                  {panel.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="box-generator__flat-footer">
        <span><i className="box-generator__legend-dot" aria-hidden="true" /> Línea de corte · {project.camProfile.kerfMm === null ? 'kerf sin configurar' : `kerf ${project.camProfile.kerfMm.toFixed(2)} mm`}</span>
        <span>{sheetNumber ? `Hoja ${sheetNumber} · ` : ''}{layout.panels.length} piezas · unidades del archivo: mm</span>
      </div>
    </div>
  );
}
