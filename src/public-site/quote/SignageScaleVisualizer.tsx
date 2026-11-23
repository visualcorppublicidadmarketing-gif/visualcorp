import { useState } from 'react';
import { Car, DoorOpen, Eye, Maximize2, User } from 'lucide-react';
import './quote-tools.css';

type ScaleReferenceId = 'person' | 'door' | 'vehicle';

const REFERENCES: Record<
  ScaleReferenceId,
  { label: string; widthM: number; heightM: number; note: string }
> = {
  person: {
    label: 'Persona (1.70 m)',
    widthM: 0.56,
    heightM: 1.7,
    note: 'Referencia humana estándar de 1.70 m',
  },
  door: {
    label: 'Puerta (2.10 m)',
    widthM: 0.92,
    heightM: 2.1,
    note: 'Puerta comercial estándar de 0.92 × 2.10 m',
  },
  vehicle: {
    label: 'Vehículo (4.50 m)',
    widthM: 4.5,
    heightM: 1.68,
    note: 'Vehículo utilitario referencial de 4.50 × 1.68 m',
  },
};

function formatDim(valueM: number) {
  if (valueM < 1) return `${Math.round(valueM * 100)} cm`;
  return `${valueM.toFixed(2).replace(/\.00$/, '')} m`;
}

export function SignageScaleVisualizer({
  width,
  height,
  unit,
  label = 'Tu pieza',
}: {
  width: number;
  height: number;
  unit: 'cm' | 'm';
  label?: string;
}) {
  const [referenceId, setReferenceId] = useState<ScaleReferenceId>('person');

  const safeW = Number.isFinite(width) && width > 0 ? width : 100;
  const safeH = Number.isFinite(height) && height > 0 ? height : 100;
  const pieceW = unit === 'cm' ? safeW / 100 : safeW;
  const pieceH = unit === 'cm' ? safeH / 100 : safeH;
  const areaM2 = pieceW * pieceH;

  const ref = REFERENCES[referenceId];
  const gapM = Math.max(0.28, Math.min(0.75, Math.max(pieceW, ref.widthM) * 0.18));
  const totalWidthM = ref.widthM + gapM + pieceW;
  const totalHeightM = Math.max(ref.heightM, pieceH);

  // Fit inside SVG stage (420x210 with generous dimension-label padding)
  const stageW = 340;
  const stageH = 148;
  const pxPerM = Math.min(stageW / Math.max(0.4, totalWidthM), stageH / Math.max(0.4, totalHeightM));

  const refPxW = ref.widthM * pxPerM;
  const refPxH = ref.heightM * pxPerM;
  const piecePxW = Math.max(14, pieceW * pxPerM);
  const piecePxH = Math.max(14, pieceH * pxPerM);
  const gapPx = gapM * pxPerM;

  const groupW = refPxW + gapPx + piecePxW;
  const startX = (420 - groupW) / 2;
  const floorY = 182;

  const refX = startX;
  const refY = floorY - refPxH;
  const pieceX = startX + refPxW + gapPx;
  const pieceY = floorY - piecePxH;

  const viewingDistance =
    pieceH < 0.35
      ? 'Lectura cercana (0.5 – 1.5 m)'
      : pieceH < 1
        ? 'Visible desde 3 – 8 m'
        : pieceH < 2.2
          ? 'Impacto en fachada (8 – 20 m)'
          : 'Gran formato exterior (+20 m)';

  return (
    <section className="vc-scale-vis" aria-label="Comparador visual de escala real">
      <div className="vc-scale-head">
        <div className="vc-scale-title">
          <Maximize2 size={15} aria-hidden="true" />
          <div>
            <b>Escala real referencial</b>
            <small>Compara tu medida de {formatDim(pieceW)} × {formatDim(pieceH)} frente a un objeto cotidiano</small>
          </div>
        </div>
        <div className="vc-scale-tabs" role="group" aria-label="Cambiar referencia de escala">
          <button
            type="button"
            className={referenceId === 'person' ? 'is-active' : ''}
            aria-pressed={referenceId === 'person'}
            onClick={() => setReferenceId('person')}
          >
            <User size={13} aria-hidden="true" /> Persona
          </button>
          <button
            type="button"
            className={referenceId === 'door' ? 'is-active' : ''}
            aria-pressed={referenceId === 'door'}
            onClick={() => setReferenceId('door')}
          >
            <DoorOpen size={13} aria-hidden="true" /> Puerta
          </button>
          <button
            type="button"
            className={referenceId === 'vehicle' ? 'is-active' : ''}
            aria-pressed={referenceId === 'vehicle'}
            onClick={() => setReferenceId('vehicle')}
          >
            <Car size={13} aria-hidden="true" /> Vehículo
          </button>
        </div>
      </div>

      <div className="vc-scale-canvas-wrap">
        <svg
          className="vc-scale-svg"
          viewBox="0 0 420 212"
          role="img"
          aria-label={`Comparación proporcional: ${label} de ${formatDim(pieceW)} por ${formatDim(pieceH)} junto a ${ref.label}`}
        >
          <defs>
            <linearGradient id="vc-piece-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38d6ff" stopOpacity="0.22" />
              <stop offset="55%" stopColor="#e5007e" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#ffd06b" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="vc-piece-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38d6ff" />
              <stop offset="55%" stopColor="#ff4db8" />
              <stop offset="100%" stopColor="#ffd06b" />
            </linearGradient>
            <pattern id="vc-blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.8" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="420" height="212" fill="url(#vc-blueprint-grid)" />
          <line x1="16" y1={floorY} x2="404" y2={floorY} stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" />

          {/* Reference silhouette */}
          <g className="vc-scale-ref-shape">
            {referenceId === 'person' && (
              <g transform={`translate(${refX}, ${refY})`}>
                <circle cx={refPxW * 0.5} cy={refPxH * 0.1} r={Math.max(3, refPxH * 0.085)} fill="currentColor" fillOpacity="0.34" />
                <path
                  d={`M ${refPxW * 0.22} ${refPxH * 0.24}
                      Q ${refPxW * 0.5} ${refPxH * 0.19} ${refPxW * 0.78} ${refPxH * 0.24}
                      L ${refPxW * 0.88} ${refPxH * 0.56}
                      L ${refPxW * 0.74} ${refPxH * 0.58}
                      L ${refPxW * 0.68} ${refPxH * 0.36}
                      L ${refPxW * 0.68} ${refPxH}
                      L ${refPxW * 0.54} ${refPxH}
                      L ${refPxW * 0.5} ${refPxH * 0.64}
                      L ${refPxW * 0.46} ${refPxH}
                      L ${refPxW * 0.32} ${refPxH}
                      L ${refPxW * 0.32} ${refPxH * 0.36}
                      L ${refPxW * 0.26} ${refPxH * 0.58}
                      L ${refPxW * 0.12} ${refPxH * 0.56} Z`}
                  fill="currentColor"
                  fillOpacity="0.26"
                />
              </g>
            )}
            {referenceId === 'door' && (
              <g transform={`translate(${refX}, ${refY})`}>
                <rect x="0" y="0" width={refPxW} height={refPxH} rx="2" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" />
                <rect x={refPxW * 0.14} y={refPxH * 0.1} width={refPxW * 0.72} height={refPxH * 0.42} rx="1.5" fill="currentColor" fillOpacity="0.12" />
                <circle cx={refPxW * 0.82} cy={refPxH * 0.54} r={Math.max(2, refPxW * 0.04)} fill="currentColor" fillOpacity="0.6" />
              </g>
            )}
            {referenceId === 'vehicle' && (
              <g transform={`translate(${refX}, ${refY})`}>
                <path
                  d={`M ${refPxW * 0.04} ${refPxH * 0.78}
                      L ${refPxW * 0.06} ${refPxH * 0.46}
                      L ${refPxW * 0.26} ${refPxH * 0.42}
                      L ${refPxW * 0.38} ${refPxH * 0.12}
                      L ${refPxW * 0.84} ${refPxH * 0.12}
                      L ${refPxW * 0.96} ${refPxH * 0.44}
                      L ${refPxW * 0.96} ${refPxH * 0.78} Z`}
                  fill="currentColor"
                  fillOpacity="0.2"
                  stroke="currentColor"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                />
                <circle cx={refPxW * 0.24} cy={refPxH * 0.82} r={Math.max(4, refPxH * 0.16)} fill="currentColor" fillOpacity="0.42" />
                <circle cx={refPxW * 0.78} cy={refPxH * 0.82} r={Math.max(4, refPxH * 0.16)} fill="currentColor" fillOpacity="0.42" />
              </g>
            )}
            <text
              x={refX + refPxW / 2}
              y={floorY + 16}
              textAnchor="middle"
              className="vc-scale-svg-caption"
            >
              {ref.label}
            </text>
          </g>

          {/* Client's custom piece */}
          <g>
            <rect
              x={pieceX}
              y={pieceY}
              width={piecePxW}
              height={piecePxH}
              rx="4"
              fill="url(#vc-piece-grad)"
              stroke="url(#vc-piece-stroke)"
              strokeWidth="2"
            />
            {piecePxW >= 62 && piecePxH >= 32 && (
              <text
                x={pieceX + piecePxW / 2}
                y={pieceY + piecePxH / 2 + 4}
                textAnchor="middle"
                className="vc-scale-svg-piece-label"
              >
                {areaM2.toFixed(2)} m²
              </text>
            )}
            {/* Width dimension line */}
            <line
              x1={pieceX}
              y1={Math.max(14, pieceY - 9)}
              x2={pieceX + piecePxW}
              y2={Math.max(14, pieceY - 9)}
              stroke="#38d6ff"
              strokeWidth="1.1"
              strokeDasharray="3 2"
            />
            <text
              x={pieceX + piecePxW / 2}
              y={Math.max(11, pieceY - 13)}
              textAnchor="middle"
              className="vc-scale-svg-dim"
            >
              {formatDim(pieceW)}
            </text>
            {/* Height label */}
            <text
              x={Math.min(410, pieceX + piecePxW + 6)}
              y={pieceY + piecePxH / 2 + 3}
              textAnchor="start"
              className="vc-scale-svg-dim"
            >
              {formatDim(pieceH)}
            </text>
            <text
              x={pieceX + piecePxW / 2}
              y={floorY + 16}
              textAnchor="middle"
              className="vc-scale-svg-caption is-accent"
            >
              {label.length > 22 ? `${label.slice(0, 22)}…` : label}
            </text>
          </g>
        </svg>
      </div>

      <div className="vc-scale-meta">
        <span>
          <Eye size={13} aria-hidden="true" />
          {viewingDistance}
        </span>
        <small>{ref.note}</small>
      </div>
    </section>
  );
}
