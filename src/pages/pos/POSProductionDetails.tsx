import React from 'react';
import { ClipboardCheck, Route } from 'lucide-react';
import './pos-production-details.css';

export type ProductionWorkflowCode = string;

export type ProductionDetailsValue = {
  workflow_code: ProductionWorkflowCode;
  specifications: Record<string, unknown>;
};

export type ProductionLine = {
  line_key: string;
  name: string;
  productId?: string | null;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  optionChoice?: string | null;
};

const workflowOptions: { code: ProductionWorkflowCode; label: string; path: string }[] = [
  { code: 'none', label: 'Entrega directa', path: 'Sin producción' },
  { code: 'review', label: 'Definir producción', path: 'Asesoría revisa la ruta' },
  { code: 'print', label: 'Impresión', path: 'Diseño → Impresión' },
  { code: 'laser', label: 'Corte láser', path: 'Diseño → Corte láser' },
  { code: 'sign', label: 'Rótulo', path: 'Diseño → Impresión → Taller' },
  { code: 'sign_measure', label: 'Rótulo con visita', path: 'Taller (medidas) → Diseño → Impresión → Taller' },
  { code: 'neon', label: 'Neón', path: 'Diseño → Corte láser → Taller' },
  { code: 'sublimation', label: 'Sublimación', path: 'Diseño → Sublimación' },
];

export const isProductionWorkflowCode = (value: unknown): value is ProductionWorkflowCode =>
  typeof value === 'string' && /^[a-z][a-z0-9_]{1,47}$/.test(value);

export const getProductionDetails = (
  line: ProductionLine,
  saved: ProductionDetailsValue | undefined,
  defaultWorkflow: ProductionWorkflowCode = 'review',
): ProductionDetailsValue => ({
  workflow_code: isProductionWorkflowCode(saved?.workflow_code) ? saved.workflow_code : defaultWorkflow,
  specifications: {
    ...(line.widthCm ? { width_cm: Number(line.widthCm) } : {}),
    ...(line.heightCm ? { height_cm: Number(line.heightCm) } : {}),
    ...(line.optionChoice ? { material: line.optionChoice } : {}),
    ...(saved?.specifications || {}),
    ...(saved?.specifications?.artwork_status === 'approved' ? { artwork_status: 'provided' } : {}),
  },
});

type Props = {
  lines: ProductionLine[];
  values: Record<string, ProductionDetailsValue>;
  routeByProduct: Record<string, ProductionWorkflowCode>;
  onChange: (lineKey: string, value: ProductionDetailsValue) => void;
  routeStatus: 'loading' | 'ready' | 'unavailable';
  templates: Array<{ code: string; name: string }>;
};

export function POSProductionDetails({ lines, values, routeByProduct, onChange, routeStatus, templates }: Props) {
  if (!lines.length) return null;
  const routesToDefine = lines.filter((line) => !values[line.line_key]?.workflow_code && (!line.productId || !routeByProduct[line.productId])).length;

  return <section className="pos-production-details" aria-labelledby="pos-production-details-title">
    <div className="pos-production-details-heading">
      <span className="pos-production-details-icon" aria-hidden="true"><Route size={17}/></span>
      <div><span className="eyebrow">ORDEN DE TRABAJO</span><h3 id="pos-production-details-title">Preparar cada trabajo</h3><p>La ruta y los datos de cada artículo acompañarán a las áreas de producción.</p></div>
    </div>
    {routeStatus === 'ready' && routesToDefine > 0 && <p className="pos-production-route-note">{routesToDefine} {routesToDefine === 1 ? 'artículo irá' : 'artículos irán'} primero a Asesoría para definir su producción. Abre cada artículo para elegir una ruta ahora.</p>}
    {routeStatus === 'loading' && <p className="pos-production-route-note" role="status">Comprobando las rutas de producción antes de confirmar la venta…</p>}
    {routeStatus === 'unavailable' && <p className="pos-production-route-note" role="alert">No pude comprobar las rutas de producción. Recarga la página antes de confirmar la venta.</p>}
    {lines.map((line, index) => {
      const mappedRoute = line.productId ? routeByProduct[line.productId] : undefined;
      const value = getProductionDetails(line, values[line.line_key], mappedRoute || 'review');
      const spec = value.specifications;
      const patch = (key: string, next: unknown) => onChange(line.line_key, { ...value, specifications: { ...spec, [key]: next } });
      const showMaterial = ['print', 'laser', 'sign', 'sign_measure', 'neon', 'sublimation'].includes(value.workflow_code);
      const showFinish = ['print', 'sign', 'sign_measure', 'sublimation'].includes(value.workflow_code);
      const showSite = ['sign', 'sign_measure', 'neon'].includes(value.workflow_code);
      const showColor = value.workflow_code === 'neon';
      const showThickness = ['laser', 'neon'].includes(value.workflow_code);
      const option = templates.find((item) => item.code === value.workflow_code);
      const fallbackPath = workflowOptions.find((item) => item.code === value.workflow_code)?.path;
      return <details className="pos-production-line" key={line.line_key}>
        <summary><span className="pos-production-line-number">{String(index + 1).padStart(2, '0')}</span><span className="pos-production-line-title"><b>{line.name}</b><small>{option?.name || fallbackPath}</small></span><span className="pos-production-line-toggle">Detalles</span></summary>
        <div className="pos-production-line-fields">
          <label className="pos-production-line-route">Ruta de trabajo<select value={value.workflow_code} onChange={(event) => onChange(line.line_key, { ...value, workflow_code: event.target.value })}>{templates.map((route) => <option key={route.code} value={route.code}>{route.name}</option>)}</select><small>{mappedRoute && !values[line.line_key]?.workflow_code ? 'Sugerida por la configuración del producto.' : 'Puedes ajustarla para este pedido.'}</small></label>
          {value.workflow_code !== 'review' && value.workflow_code !== 'none' && <fieldset className="pos-production-fieldset"><legend>Datos que recibirá el equipo</legend>
            {line.widthCm && line.heightCm ? <p className="pos-production-measure-note">Medida vendida: <b>{line.widthCm} × {line.heightCm} cm</b>. Se toma del artículo para evitar diferencias con el precio.</p> : <div className="pos-production-field-grid"><label>Ancho (cm)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={String(spec.width_cm ?? '')} onChange={(event) => patch('width_cm', event.target.value)} placeholder="Por confirmar"/></label><label>Alto (cm)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={String(spec.height_cm ?? '')} onChange={(event) => patch('height_cm', event.target.value)} placeholder="Por confirmar"/></label></div>}
            {showMaterial && <label>Material o soporte<input maxLength={180} value={String(spec.material ?? '')} onChange={(event) => patch('material', event.target.value)} placeholder={value.workflow_code === 'laser' ? 'Ej. acrílico, MDF' : value.workflow_code === 'sublimation' ? 'Ej. camiseta, taza, almohada' : 'Ej. lona, vinil, acrílico'}/></label>}
            {showThickness && <label>Espesor del material (mm)<input type="number" min="0.1" step="0.1" inputMode="decimal" value={String(spec.thickness_mm ?? '')} onChange={(event) => patch('thickness_mm', event.target.value)} placeholder="Por confirmar"/></label>}
            {showFinish && <label>Acabado y montaje<input maxLength={220} value={String(spec.finish ?? '')} onChange={(event) => patch('finish', event.target.value)} placeholder={value.workflow_code === 'print' ? 'Ojales, laminado, corte, borde…' : 'Cómo debe quedar terminado'}/></label>}
            {showColor && <label>Color del neón<input maxLength={100} value={String(spec.neon_color ?? '')} onChange={(event) => patch('neon_color', event.target.value)} placeholder="Color o combinación"/></label>}
            {showSite && <label>Lugar y condiciones de instalación<input maxLength={260} value={String(spec.site_details ?? '')} onChange={(event) => patch('site_details', event.target.value)} placeholder="Superficie, altura, acceso o referencia"/></label>}
            <label>Archivo de diseño al recibir el pedido<select value={String(spec.artwork_status ?? 'pending')} onChange={(event) => patch('artwork_status', event.target.value)}><option value="pending">Por definir</option><option value="design_needed">Hay que diseñarlo</option><option value="provided">El cliente entregará archivo</option></select></label>
            <label className="pos-production-approval"><input type="checkbox" checked={spec.approval_required === true} onChange={(event) => patch('approval_required', event.target.checked)}/><span><b>Revisar y aprobar el arte antes de producir</b><small>Diseño entregará un enlace; Asesoría aprobará o pedirá correcciones. Impresión, corte y taller esperarán esa decisión.</small></span></label>
          </fieldset>}
          {value.workflow_code !== 'none' && <><label>Indicaciones para el equipo<textarea rows={2} maxLength={1500} value={String(spec.notes ?? '')} onChange={(event) => patch('notes', event.target.value)} placeholder="Referencia, colores, ubicación, instrucciones o dudas pendientes"/></label>
          <p className="pos-production-line-help"><ClipboardCheck size={14}/> Los datos pendientes se podrán completar en la ficha del trabajo.</p></>}
        </div>
      </details>;
    })}
  </section>;
}
