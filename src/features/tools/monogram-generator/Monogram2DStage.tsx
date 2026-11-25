import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { formatMonogramLength } from './monogramModel';
import type { MonogramDisplayUnit } from './monogramModel';
import type { MonogramOutline } from './monogramVector';

interface Monogram2DStageProps {
  width: number;
  height: number;
  displayUnit: MonogramDisplayUnit;
  outlines: MonogramOutline[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
}

interface DragState {
  id: string;
  pointerId: number;
  x: number;
  y: number;
}

function svgPoint(event: ReactPointerEvent<SVGSVGElement>, svg: SVGSVGElement) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

export function Monogram2DStage({ width, height, displayUnit, outlines, selectedId, onSelect, onMove }: Monogram2DStageProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const startDrag = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    if (!svgRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = svgPoint(event as unknown as ReactPointerEvent<SVGSVGElement>, svgRef.current);
    dragRef.current = { id, pointerId: event.pointerId, x: point.x, y: point.y };
    svgRef.current.setPointerCapture(event.pointerId);
    onSelect(id);
  };

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !svg) return;
    const point = svgPoint(event, svg);
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) onMove(drag.id, dx, -dy);
    dragRef.current = { ...drag, x: point.x, y: point.y };
  };

  const stopDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const moveByKeyboard = (event: ReactKeyboardEvent<SVGGElement>, id: string) => {
    const distance = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, distance],
      ArrowDown: [0, -distance],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(id);
    onMove(id, move[0], move[1]);
  };

  const unitName = displayUnit === 'cm' ? 'centímetros' : 'milímetros';
  const normalMove = displayUnit === 'cm' ? '0,1 cm' : '1 mm';
  const largerMove = displayUnit === 'cm' ? '1 cm' : '10 mm';

  return (
    <svg
      ref={svgRef}
      className="monogram__artboard"
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={`Editor 2D de monograma, área de ${formatMonogramLength(width, displayUnit)} por ${formatMonogramLength(height, displayUnit)} ${unitName}`}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <defs>
        <pattern id="monogram-grid" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(184,198,220,.09)" strokeWidth=".18" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="2" fill="url(#monogram-grid)" />
      <path d={`M ${width / 2} 0 V ${height} M 0 ${height / 2} H ${width}`} stroke="rgba(184,198,220,.18)" strokeDasharray="1.5 1.5" strokeWidth=".22" pointerEvents="none" />
      {outlines.map((outline) => {
        const selected = outline.id === selectedId;
        return (
          <g
            key={outline.id}
            className={`monogram__vector-layer${selected ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Capa de texto: ${outline.text || 'vacía'}. Usa flechas para mover ${normalMove}; Shift más flecha mueve ${largerMove}.`}
            aria-pressed={selected}
            onPointerDown={(event) => startDrag(event, outline.id)}
            onKeyDown={(event) => moveByKeyboard(event, outline.id)}
          >
            <path
              d={outline.d}
              transform={outline.transform}
              fill="#eabf77"
              fillRule="nonzero"
              stroke={selected ? '#f8f1df' : '#3a2e1e'}
              strokeWidth={selected ? '.6' : '.18'}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {outlines.length === 0 && <text x={width / 2} y={height / 2} textAnchor="middle" className="monogram__empty-label">Añade una capa de texto</text>}
    </svg>
  );
}
