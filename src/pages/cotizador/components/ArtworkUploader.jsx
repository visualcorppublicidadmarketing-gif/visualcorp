import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, FileText, Image as ImageIcon, X, Sparkles } from 'lucide-react';
import { uploadMedia } from '../../../lib/siteRepository';

/**
 * Uploader de arte y archivos con validación automática de resolución (DPI Preflight)
 */
export function ArtworkUploader({
  widthCm = 100,
  heightCm = 100,
  onArtworkChange,
  artwork = null
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const fileInputRef = useRef(null);

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;

    // Check size (< 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('El archivo excede el tamaño máximo permitido de 50 MB.');
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isVector = file.name.endsWith('.ai') || file.name.endsWith('.cdr') || file.name.endsWith('.eps') || file.name.endsWith('.svg');

    // DPI preflight calculation for raster images
    if (isImage) {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const pxW = img.naturalWidth;
        const pxH = img.naturalHeight;
        const dpiW = (pxW / (widthCm / 2.54));
        const dpiH = (pxH / (heightCm / 2.54));
        const avgDpi = Math.round((dpiW + dpiH) / 2);

        let qualityStatus = 'excellent';
        let qualityMessage = `Resolución nítida (${avgDpi} DPI efectivos). Óptimo para impresión.`;

        if (avgDpi < 72) {
          qualityStatus = 'low';
          qualityMessage = `Resolución baja (${avgDpi} DPI). Para este tamaño (${widthCm}×${heightCm}cm) recomendamos un archivo de mayor calidad o en vectores (PDF/AI).`;
        } else if (avgDpi < 120) {
          qualityStatus = 'medium';
          qualityMessage = `Resolución estándar (${avgDpi} DPI). Adecuado para visión a media distancia (lonas y vallas).`;
        }

        setPreflight({
          widthPx: pxW,
          heightPx: pxH,
          dpi: avgDpi,
          status: qualityStatus,
          message: qualityMessage
        });
      };
      img.src = objectUrl;
    } else if (isVector || isPDF) {
      setPreflight({
        status: 'excellent',
        dpi: 300,
        message: 'Formato vectorial / PDF. Calidad de impresión vectorial máxima sin pérdida.'
      });
    }

    // Try remote upload to Supabase Storage if configured
    setUploading(true);
    let remoteUrl = null;
    try {
      remoteUrl = await uploadMedia(file, 'quote-artworks');
    } catch {
      // Local fallback
    }
    setUploading(false);

    const artworkData = {
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      type: file.type || 'application/octet-stream',
      remoteUrl: remoteUrl || null,
      previewUrl: isImage ? URL.createObjectURL(file) : null
    };

    if (onArtworkChange) {
      onArtworkChange(artworkData);
    }
  };

  const removeFile = (e) => {
    e.stopPropagation();
    setPreflight(null);
    if (onArtworkChange) onArtworkChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="artwork-uploader-wrap">
      {!artwork ? (
        <div
          className={`artwork-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.ai,.cdr,.eps,.svg,.jpg,.jpeg,.png,.webp,.tiff"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="dropzone-icon">
            <UploadCloud size={28} />
          </div>
          <div className="dropzone-text">
            <strong>{uploading ? 'Cargando archivo...' : 'Arrastra tu archivo aquí o haz clic para seleccionar'}</strong>
            <small>Aceptamos PDF, AI, CDR, PSD, JPG o PNG en alta calidad (hasta 50 MB)</small>
          </div>
        </div>
      ) : (
        <div className="artwork-uploaded-card">
          <div className="uploaded-file-left">
            {artwork.previewUrl ? (
              <img src={artwork.previewUrl} alt="Preview" className="uploaded-thumb" />
            ) : (
              <div className="uploaded-file-icon">
                <FileText size={24} />
              </div>
            )}
            <div className="uploaded-file-info">
              <strong>{artwork.name}</strong>
              <small>{artwork.size} · {artwork.remoteUrl ? 'Cargado en servidor seguro' : 'Adjunto local listo para cotización'}</small>
            </div>
          </div>
          <button
            type="button"
            className="uploaded-remove-btn"
            onClick={removeFile}
            title="Quitar archivo"
            aria-label="Quitar archivo"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* DPI Preflight Validation Badge */}
      {preflight && (
        <div className={`preflight-badge ${preflight.status}`}>
          {preflight.status === 'excellent' ? (
            <CheckCircle2 size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
          ) : preflight.status === 'medium' ? (
            <Sparkles size={15} style={{ color: '#0284c7', flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
          )}
          <span>{preflight.message}</span>
        </div>
      )}
    </div>
  );
}
