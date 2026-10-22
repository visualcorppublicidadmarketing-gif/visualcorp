import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { supabase, hasSupabase } from '../../lib/supabase';
import { useToast } from './Toast';

export function SupabaseFileUploader({
  bucket = 'gigaprint-media',
  folder = 'artworks',
  allowedTypes = ['.pdf', '.ai', '.cdr', '.tiff', '.png', '.jpg', '.jpeg', '.webp', '.svg'],
  maxSizeMB = 50,
  onUploadComplete,
  label = 'Subir Archivo de Arte / Vector'
}) {
  const toast = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrorMsg(`El archivo excede el tamaño máximo permitido de ${maxSizeMB}MB.`);
      return;
    }

    setFileName(file.name);
    setErrorMsg('');
    setUploading(true);
    setProgress(20);

    const ext = file.name.split('.').pop().toLowerCase();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${folder}/${Date.now()}_${cleanName}`;

    try {
      if (hasSupabase && supabase) {
        setProgress(50);
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(path, file, { cacheControl: '3600', upsert: true });

        if (error) {
          throw new Error(error.message);
        }

        setProgress(90);
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        const url = publicUrlData?.publicUrl || '';
        setUploadedUrl(url);
        setProgress(100);
        setUploading(false);
        if (onUploadComplete) onUploadComplete(url, file.name);
      } else {
        // Fallback: Read as Local Data URL
        const reader = new FileReader();
        reader.onload = (e) => {
          const localUrl = e.target.result;
          setUploadedUrl(localUrl);
          setProgress(100);
          setUploading(false);
          if (onUploadComplete) onUploadComplete(localUrl, file.name);
        };
        reader.readAsDataURL(file);
      }
    } catch (e) {
      console.warn('Storage upload fallback:', e);
      // Fallback local reader
      const reader = new FileReader();
      reader.onload = (e) => {
        const localUrl = e.target.result;
        setUploadedUrl(localUrl);
        setProgress(100);
        setUploading(false);
        if (onUploadComplete) onUploadComplete(localUrl, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleCopyLink = () => {
    if (!uploadedUrl) return;
    navigator.clipboard.writeText(uploadedUrl);
    toast.success('¡Enlace de archivo copiado al portapapeles!');
  };

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>{label}</label>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed var(--orange)' : '2px dashed var(--line)',
          background: isDragging ? 'var(--orange-soft)' : 'var(--bg)',
          borderRadius: '14px',
          padding: '24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'grid',
          gap: '8px',
          justifyItems: 'center'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.join(',')}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div style={{ display: 'grid', gap: '8px', justifyItems: 'center' }}>
            <Loader2 size={32} className="spin" style={{ color: 'var(--orange)' }} />
            <span style={{ fontSize: '13px', fontWeight: 800 }}>Subiendo archivo ({progress}%)...</span>
          </div>
        ) : uploadedUrl ? (
          <div style={{ display: 'grid', gap: '6px', justifyItems: 'center' }}>
            <CheckCircle2 size={32} style={{ color: '#16a34a' }} />
            <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{fileName}</strong>
            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 800 }}>✓ Subido con éxito</span>
          </div>
        ) : (
          <>
            <UploadCloud size={32} style={{ color: 'var(--orange)' }} />
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--ink)', display: 'block' }}>
                Arrastra tu archivo aquí o haz clic para examinar
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Admite PDF, AI, CDR, TIFF, PNG, JPG hasta {maxSizeMB}MB
              </span>
            </div>
          </>
        )}
      </div>

      {errorMsg && (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      {uploadedUrl && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleCopyLink}
            className="pos-nav-tab"
            style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Copy size={13} /> Copiar Enlace
          </button>
          <a
            href={uploadedUrl}
            target="_blank"
            rel="noreferrer"
            className="pos-nav-tab"
            style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'var(--ink)' }}
          >
            <ExternalLink size={13} /> Ver Archivo
          </a>
        </div>
      )}
    </div>
  );
}
