import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import './quote-tools.css';

type PreflightStatus = 'optimal' | 'good' | 'warning' | 'vector' | 'pdf';

type PreflightReport = {
  fileName: string;
  fileSizeKB: number;
  mimeType: string;
  previewUrl: string | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  effectiveDpi: number | null;
  ratioMismatchPct: number | null;
  status: PreflightStatus;
  headline: string;
  detail: string;
};

const MIN_TARGET_CM = 2;
const MAX_TARGET_CM = 2000;

function clampTargetCm(value: number) {
  return Number.isFinite(value)
    ? Math.min(MAX_TARGET_CM, Math.max(MIN_TARGET_CM, value))
    : MIN_TARGET_CM;
}

function targetCmInputValue(value: number) {
  return String(Number(clampTargetCm(value).toFixed(2)));
}

function parseTargetCm(value: string) {
  return clampTargetCm(Number(value.replace(',', '.')));
}

function formatTargetCm(value: number) {
  return new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 }).format(value);
}

function evaluatePreflight(
  file: File,
  pixelWidth: number | null,
  pixelHeight: number | null,
  previewUrl: string | null,
  targetWidthCm: number,
  targetHeightCm: number,
): PreflightReport {
  const fileSizeKB = Math.max(1, Math.round(file.size / 1024));
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isSvg) {
    return {
      fileName: file.name,
      fileSizeKB,
      mimeType: file.type || 'image/svg+xml',
      previewUrl,
      pixelWidth,
      pixelHeight,
      effectiveDpi: null,
      ratioMismatchPct: null,
      status: 'vector',
      headline: 'Archivo vectorial óptimo para cualquier tamaño',
      detail: 'Escala sin pixelarse para imprenta, gran formato, rótulos y corte láser. Verifica que los textos estén convertidos a curvas.',
    };
  }

  if (isPdf) {
    return {
      fileName: file.name,
      fileSizeKB,
      mimeType: file.type || 'application/pdf',
      previewUrl: null,
      pixelWidth: null,
      pixelHeight: null,
      effectiveDpi: null,
      ratioMismatchPct: null,
      status: 'pdf',
      headline: 'PDF detectado · listo para revisión de preprensa',
      detail: 'Verifica antes de enviar que las fuentes estén trazadas, las imágenes internas a ≥300 DPI (o ≥150 DPI en gran formato) y con 3 mm de sangrado.',
    };
  }

  const wCm = Math.max(1, targetWidthCm);
  const hCm = Math.max(1, targetHeightCm);
  const dpiW = pixelWidth ? pixelWidth / (wCm / 2.54) : 0;
  const dpiH = pixelHeight ? pixelHeight / (hCm / 2.54) : 0;
  const effectiveDpi = pixelWidth && pixelHeight ? Math.round(Math.min(dpiW, dpiH)) : null;

  const imgRatio = pixelWidth && pixelHeight ? pixelWidth / pixelHeight : null;
  const targetRatio = wCm / hCm;
  const ratioMismatchPct =
    imgRatio && targetRatio ? Math.round((Math.abs(imgRatio - targetRatio) / targetRatio) * 100) : null;

  if (effectiveDpi !== null && effectiveDpi >= 300) {
    return {
      fileName: file.name,
      fileSizeKB,
      mimeType: file.type,
      previewUrl,
      pixelWidth,
      pixelHeight,
      effectiveDpi,
      ratioMismatchPct,
      status: 'optimal',
      headline: `Resolución óptima para imprenta (${effectiveDpi} DPI)`,
      detail: 'Calidad nítida para tarjetas, flyers, stickers, sublimación y gran formato. Deja 3 mm de sangrado alrededor del borde.',
    };
  }

  if (effectiveDpi !== null && effectiveDpi >= 150) {
    return {
      fileName: file.name,
      fileSizeKB,
      mimeType: file.type,
      previewUrl,
      pixelWidth,
      pixelHeight,
      effectiveDpi,
      ratioMismatchPct,
      status: 'good',
      headline: `Adecuado para gran formato (${effectiveDpi} DPI)`,
      detail: 'Funciona bien para lonas, banners, viniles y rótulos vistos a distancia. Para imprenta pequeña se recomienda ≥300 DPI.',
    };
  }

  return {
    fileName: file.name,
    fileSizeKB,
    mimeType: file.type,
    previewUrl,
    pixelWidth,
    pixelHeight,
    effectiveDpi,
    ratioMismatchPct,
    status: 'warning',
    headline: `Resolución baja para ${wCm} × ${hCm} cm (${effectiveDpi ?? 0} DPI)`,
    detail: 'Al imprimir a este tamaño puede verse pixelado. Envía el archivo original en mayor resolución o marca «Adaptación / Vectorización» con nuestro equipo.',
  };
}

export function ArtworkPreflightDropzone({
  initialWidthCm = 50,
  initialHeightCm = 50,
  compact = false,
}: {
  initialWidthCm?: number;
  initialHeightCm?: number;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [targetWidthCm, setTargetWidthCm] = useState(targetCmInputValue(initialWidthCm));
  const [targetHeightCm, setTargetHeightCm] = useState(targetCmInputValue(initialHeightCm));
  const targetWidthCmValue = parseTargetCm(targetWidthCm);
  const targetHeightCmValue = parseTargetCm(targetHeightCm);
  const [isDragging, setIsDragging] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [fileState, setFileState] = useState<{
    file: File;
    pixelWidth: number | null;
    pixelHeight: number | null;
    previewUrl: string | null;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setTargetWidthCm(targetCmInputValue(initialWidthCm));
    setTargetHeightCm(targetCmInputValue(initialHeightCm));
  }, [initialWidthCm, initialHeightCm]);

  useEffect(() => {
    const url = fileState?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileState?.previewUrl]);

  const inspectFile = (file: File) => {
    setError('');
    const allowed = /^(image\/(png|jpeg|webp|svg\+xml)|application\/pdf)$/i.test(file.type)
      || /\.(png|jpe?g|webp|svg|pdf)$/i.test(file.name);
    if (!allowed) {
      setError('Formato no soportado. Usa PNG, JPG, WebP, SVG o PDF.');
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setError('El archivo supera 40 MB. Compártelo por enlace o WhatsApp al enviar tu solicitud.');
      return;
    }

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      setFileState({ file, pixelWidth: null, pixelHeight: null, previewUrl: null });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setFileState({
        file,
        pixelWidth: img.naturalWidth || null,
        pixelHeight: img.naturalHeight || null,
        previewUrl: objectUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError('No pudimos leer las dimensiones de esta imagen. Prueba con otro archivo PNG, JPG, WebP o SVG.');
    };
    img.src = objectUrl;
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) inspectFile(file);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  };

  const clearFile = () => {
    setFileState(null);
    setError('');
  };

  const report = fileState
    ? evaluatePreflight(
        fileState.file,
        fileState.pixelWidth,
        fileState.pixelHeight,
        fileState.previewUrl,
        targetWidthCmValue,
        targetHeightCmValue,
      )
    : null;

  return (
    <section className={`vc-preflight${compact ? ' is-compact' : ''}`} aria-label="Verificador rápido de archivo para imprenta">
      <div className="vc-preflight-head">
        <div>
          <span className="vc-preflight-kicker">
            <FileCheck2 size={14} aria-hidden="true" />
            VERIFICADOR DE ARTE PARA IMPRENTA
          </span>
          <h3>Comprueba si tu diseño se imprimirá nítido</h3>
          <p>Arrastra tu logo o arte y revisa su resolución real (DPI), proporción y zona de corte. Ajusta el tamaño final en centímetros con hasta dos decimales.</p>
        </div>
        <span className="vc-preflight-privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          100% local en tu navegador
        </span>
      </div>

      <div className="vc-preflight-size-row">
        <label>
          Ancho final (cm)
          <input
            type="number"
            inputMode="decimal"
            min={MIN_TARGET_CM}
            max={MAX_TARGET_CM}
            step="0.01"
            value={targetWidthCm}
            onChange={(event) => setTargetWidthCm(event.target.value)}
            onBlur={() => setTargetWidthCm(targetCmInputValue(targetWidthCmValue))}
          />
        </label>
        <label>
          Alto final (cm)
          <input
            type="number"
            inputMode="decimal"
            min={MIN_TARGET_CM}
            max={MAX_TARGET_CM}
            step="0.01"
            value={targetHeightCm}
            onChange={(event) => setTargetHeightCm(event.target.value)}
            onBlur={() => setTargetHeightCm(targetCmInputValue(targetHeightCmValue))}
          />
        </label>
        <div className="vc-preflight-presets" role="group" aria-label="Tamaños frecuentes">
          <button type="button" onClick={() => { setTargetWidthCm('9'); setTargetHeightCm('5'); }}>Tarjeta 9×5</button>
          <button type="button" onClick={() => { setTargetWidthCm('21'); setTargetHeightCm('30'); }}>A4</button>
          <button type="button" onClick={() => { setTargetWidthCm('80'); setTargetHeightCm('200'); }}>Roll-Up 80×200</button>
          <button type="button" onClick={() => { setTargetWidthCm('200'); setTargetHeightCm('100'); }}>Lona 2×1 m</button>
        </div>
      </div>

      <div
        className={`vc-preflight-dropzone${isDragging ? ' is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Seleccionar o arrastrar archivo de diseño para verificar resolución"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
          className="sr-only"
          onChange={handleInputChange}
        />
        <span className="vc-preflight-upload-icon" aria-hidden="true">
          <Upload size={20} />
        </span>
        <div>
          <strong>{fileState ? 'Cambiar archivo analizado' : 'Arrastra tu diseño aquí o haz clic para elegir'}</strong>
          <small>PNG, JPG, WebP, SVG o PDF · hasta 40 MB · no se envía a servidores externos</small>
        </div>
      </div>

      {error && (
        <p className="vc-preflight-error" role="alert">
          <AlertTriangle size={15} aria-hidden="true" /> {error}
        </p>
      )}

      {report && (
        <div className={`vc-preflight-result is-${report.status}`} role="status" aria-live="polite">
          <div className="vc-preflight-result-top">
            <div className="vc-preflight-status-copy">
              {report.status === 'warning' ? (
                <AlertTriangle size={18} aria-hidden="true" />
              ) : report.status === 'pdf' ? (
                <FileText size={18} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={18} aria-hidden="true" />
              )}
              <div>
                <strong>{report.headline}</strong>
                <p>{report.detail}</p>
              </div>
            </div>
            <button type="button" className="vc-preflight-clear" onClick={clearFile} aria-label="Quitar archivo analizado">
              <X size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="vc-preflight-metrics">
            <span><small>Archivo</small><b>{report.fileName}</b></span>
            <span><small>Peso</small><b>{report.fileSizeKB >= 1024 ? `${(report.fileSizeKB / 1024).toFixed(1)} MB` : `${report.fileSizeKB} KB`}</b></span>
            {report.pixelWidth && report.pixelHeight && (
              <span><small>Dimensiones</small><b>{report.pixelWidth} × {report.pixelHeight} px</b></span>
            )}
            {report.effectiveDpi !== null && (
              <span><small>DPI efectivo</small><b>{report.effectiveDpi} DPI</b></span>
            )}
            <span><small>Medida objetivo</small><b>{formatTargetCm(targetWidthCmValue)} × {formatTargetCm(targetHeightCmValue)} cm</b></span>
          </div>

          {report.ratioMismatchPct !== null && report.ratioMismatchPct >= 14 && (
            <p className="vc-preflight-ratio-note">
              <Sparkles size={14} aria-hidden="true" />
              La proporción de tu imagen difiere en ~{report.ratioMismatchPct}% respecto a {formatTargetCm(targetWidthCmValue)} × {formatTargetCm(targetHeightCmValue)} cm; al imprimir requerirá recorte o ajuste de formato.
            </p>
          )}

          {report.previewUrl && (
            <div className="vc-preflight-preview-block">
              <div className="vc-preflight-preview-bar">
                <span><Layers size={13} aria-hidden="true" /> Vista previa de corte y zona segura</span>
                <label className="vc-preflight-guide-toggle">
                  <input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} />
                  Mostrar guías de sangrado (3 mm)
                </label>
              </div>
              <div className="vc-preflight-sheet">
                <img src={report.previewUrl} alt={`Vista previa de ${report.fileName}`} />
                {showGuides && (
                  <>
                    <span className="vc-guide-cut" aria-hidden="true" />
                    <span className="vc-guide-safe" aria-hidden="true" />
                  </>
                )}
              </div>
              {showGuides && (
                <div className="vc-preflight-legend">
                  <span><i className="is-cut" /> Línea roja: borde aproximado de corte</span>
                  <span><i className="is-safe" /> Línea cian: zona segura para textos y logos</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
