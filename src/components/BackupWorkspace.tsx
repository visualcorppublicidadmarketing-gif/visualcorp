import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, FileUp, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import './BackupWorkspace.css';

const COLLECTIONS = ['services', 'catalog', 'legacyCatalog', 'customers', 'inventory', 'inventoryMovements', 'leads', 'quotes', 'sales', 'campaigns'];
const BACKUP_FORMAT = 'visualcorp-suite-workspace-backup';
const stamp = () => new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

function recordCounts(data) {
  return Object.fromEntries(COLLECTIONS.map((key) => [key, Array.isArray(data?.[key]) ? data[key].length : 0])) as Record<string, number>;
}

function validateBackup(value) {
  if (value?.format !== BACKUP_FORMAT || value?.formatVersion !== 1) return 'El archivo no es un respaldo compatible de Visual Corp Suite.';
  if (!value.data || value.data.schemaVersion !== 1 || !Array.isArray(value.data.inventory)) return 'El respaldo no contiene un espacio de trabajo válido.';
  for (const key of COLLECTIONS) {
    if (!Array.isArray(value.data[key])) return `Falta la colección “${key}” o no tiene el formato esperado.`;
    if (value.data[key].some((row) => !row || typeof row !== 'object' || !row.id)) return `La colección “${key}” contiene registros sin ID; no se importó nada.`;
  }
  if (!value.data.settings || typeof value.data.settings !== 'object') return 'El archivo no contiene la configuración del espacio.';
  return '';
}

function mergeWithoutOverwrite(current, incoming) {
  const result = { ...current };
  const summary: Record<string, { added: number; kept: number; conflicts: number }> = {};
  for (const key of COLLECTIONS) {
    const localRows = Array.isArray(current[key]) ? current[key] : [];
    const importedRows = incoming[key];
    const byId = new Map(localRows.map((row) => [row.id, row]));
    let added = 0;
    let kept = 0;
    let conflicts = 0;
    for (const row of importedRows) {
      const currentRow = byId.get(row.id);
      const duplicateInventorySku = key === 'inventory' && row.sku && localRows.some((local) => local.sku === row.sku && local.id !== row.id);
      if (!currentRow && !duplicateInventorySku) {
        byId.set(row.id, row);
        added += 1;
      } else {
        kept += 1;
        if (currentRow && JSON.stringify(currentRow) !== JSON.stringify(row)) conflicts += 1;
      }
    }
    result[key] = [...byId.values()];
    summary[key] = { added, kept, conflicts };
  }
  result.settings = { ...incoming.settings, ...current.settings };
  result.schemaVersion = current.schemaVersion || incoming.schemaVersion;
  return { data: result, summary };
}

export function BackupWorkspace() {
  const { data, setData, flash } = useWorkspace();
  const { hasPermission } = useAuth();
  const canExport = hasPermission('backup', 'view');
  const canImport = hasPermission('backup', 'edit');
  const [pendingBackup, setPendingBackup] = useState<null | { fileName: string; exportedAt?: string; data: any; recordCounts: Record<string, number> }>(null);
  const [error, setError] = useState('');
  const [lastImport, setLastImport] = useState<null | { fileName: string; summary: Record<string, { added: number; kept: number; conflicts: number }> }>(null);
  const counts = useMemo(() => recordCounts(data), [data]);
  const totalRecords = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const makeBackup = async () => {
    const exportedAt = new Date().toISOString();
    const payload = {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      application: 'Visual Corp Suite',
      exportedAt,
      localStorageKey: 'visualcorp-suite-local-v1',
      recordCounts: recordCounts(data),
      data,
    };
    const fileName = `VisualCorp_Respaldo_${stamp()}.json`;
    const content = JSON.stringify(payload, null, 2);
    let savedWithPicker = false;
    const saveFilePicker = (window as Window & { showSaveFilePicker?: (options: any) => Promise<any> }).showSaveFilePicker;
    if (saveFilePicker) {
      try {
        const handle = await saveFilePicker({ suggestedName: fileName, types: [{ description: 'Respaldo de Visual Corp Suite', accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(new Blob([content], { type: 'application/json;charset=utf-8' }));
        await writable.close();
        savedWithPicker = true;
      } catch (cause) {
        if (cause?.name === 'AbortError') return;
      }
    }
    try {
      if (!savedWithPicker) {
        const blobUrl = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a'); link.href = blobUrl; link.download = fileName; link.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
      flash(`Respaldo creado: ${totalRecords} registros en ${fileName}`);
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError(`No se pudo guardar el respaldo: ${cause?.message || 'error de archivo'}`);
    }
  };

  const readBackup = async (file) => {
    if (!canImport) return;
    setError(''); setPendingBackup(null); setLastImport(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const validationError = validateBackup(parsed);
      if (validationError) { setError(validationError); return; }
      setPendingBackup({ fileName: file.name, exportedAt: parsed.exportedAt, data: parsed.data, recordCounts: recordCounts(parsed.data) });
    } catch {
      setError('No pude leer el archivo. Asegúrate de seleccionar el JSON de respaldo completo.');
    }
  };

  const importMerge = () => {
    if (!canImport || !pendingBackup) return;
    const { data: merged, summary } = mergeWithoutOverwrite(data, pendingBackup.data);
    setData(merged);
    setLastImport({ fileName: pendingBackup.fileName, summary });
    setPendingBackup(null);
    flash('Respaldo combinado. Los datos locales existentes se conservaron.');
  };

  return <div className="backup-workspace">
    <div className="backup-intro panel"><span className="backup-intro-icon"><ShieldCheck size={22}/></span><div><span className="eyebrow">RESPALDO LOCAL Y ALCANCE</span><h2>Respalda la instantánea local de este navegador</h2><p>Esta herramienta exporta y combina los datos guardados en el almacenamiento local del navegador (<code className="backup-inline-code">visualcorp-suite-local-v1</code>). Los módulos operativos conectados (Personal, Horarios, Marketing, Sugerencias, Usuarios y operaciones centrales) persisten directamente en Supabase.</p></div></div>
    <div className="backup-stats"><article><Database/><span>Registros en navegador</span><b>{totalRecords}</b></article><article><FileUp/><span>Inventario local</span><b>{counts.inventory}</b></article><article><ShieldCheck/><span>Cobertura</span><b>Instantánea local</b></article></div>
    <div className="backup-actions-grid">
      {canExport&&<section className="panel backup-card"><div className="backup-card-icon"><Download size={20}/></div><h3>Crear respaldo JSON del navegador</h3><p>Incluye inventario, movimientos, ventas, clientes, solicitudes, cotizaciones, campañas, catálogo y configuración guardados localmente en este equipo.</p><button className="button button-dark" onClick={makeBackup}><Download size={16}/> Guardar respaldo</button><small>Descárgalo antes de limpiar el navegador o cambiar de equipo. Guárdalo en una carpeta segura fuera del repositorio.</small></section>}
      {canImport&&<section className="panel backup-card"><div className="backup-card-icon"><FileUp size={20}/></div><h3>Recuperar o combinar respaldo local</h3><p>Revisa el archivo antes de aplicarlo. La combinación agrega registros faltantes y conserva los datos locales existentes ante cualquier conflicto.</p><label className="backup-file-input">Seleccionar respaldo JSON<input type="file" accept=".json,application/json" onChange={(event) => readBackup(event.target.files?.[0])}/></label>{pendingBackup&&<div className="backup-preview"><b>{pendingBackup.fileName}</b><span>Exportado: {pendingBackup.exportedAt ? new Date(pendingBackup.exportedAt).toLocaleString('es-EC') : 'Fecha no registrada'}</span><span>{Object.values(pendingBackup.recordCounts).reduce((sum,value)=>sum+value,0)} registros · modo seguro: solo agregar y conservar conflictos</span><button className="button button-outline" onClick={importMerge}>Combinar sin sobrescribir</button></div>}</section>}
    </div>
    {error&&<div className="backup-message error"><AlertCircle size={17}/>{error}</div>}
    {lastImport&&<section className="panel backup-result"><h3><CheckCircle2 size={18}/> Respaldo combinado</h3><p>{lastImport.fileName}; los registros locales con IDs coincidentes se conservaron.</p><div className="backup-result-grid">{Object.entries(lastImport.summary).filter(([,result])=>result.added||result.conflicts).map(([name,result])=><span key={name}><b>{name}</b> · +{result.added} agregados · {result.conflicts} conflictos conservados</span>)}</div></section>}
    <section className="panel backup-plan"><span className="eyebrow">ALCANCE Y BUENAS PRÁCTICAS</span><h3>Instantánea del navegador vs. módulos en Supabase</h3><ol><li><strong>Qué respalda este archivo JSON:</strong> las colecciones almacenadas en el navegador actual (<code className="backup-inline-code">services</code>, <code className="backup-inline-code">catalog</code>, <code className="backup-inline-code">customers</code>, <code className="backup-inline-code">inventory</code>, <code className="backup-inline-code">quotes</code>, <code className="backup-inline-code">sales</code>, <code className="backup-inline-code">campaigns</code> y preferencias locales).</li><li><strong>Qué vive en Supabase:</strong> fichas de Personal, compensación y deducciones, Horarios y turnos, Marketing, Sugerencias, perfiles de acceso y registros centrales con respaldo administrado en PostgreSQL.</li><li><strong>Cuándo exportar:</strong> antes de cambiar de navegador/equipo, borrar caché del sitio o combinar trabajo sin conexión.</li><li><strong>Combinación sin sobrescritura:</strong> al importar un JSON solo se añaden IDs o SKUs nuevos; los registros ya presentes en este navegador permanecen intactos.</li></ol><p className="backup-caveat">Los respaldos contienen información comercial y de clientes. Consérvalos en almacenamiento privado y nunca subas archivos JSON de respaldo ni credenciales a GitHub.</p></section>
  </div>;
}
