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
    <div className="backup-intro panel"><span className="backup-intro-icon"><ShieldCheck size={22}/></span><div><span className="eyebrow">RESPALDO Y MIGRACIÓN</span><h2>Protege los datos antes de conectar servicios</h2><p>La información actual vive en el almacenamiento local de este navegador. Descarga un respaldo antes de cambiar la persistencia o trabajar en otro dispositivo.</p></div></div>
    <div className="backup-stats"><article><Database/><span>Registros locales</span><b>{totalRecords}</b></article><article><FileUp/><span>Inventario</span><b>{counts.inventory}</b></article><article><ShieldCheck/><span>Estado</span><b>Solo local</b></article></div>
    <div className="backup-actions-grid">
      {canExport&&<section className="panel backup-card"><div className="backup-card-icon"><Download size={20}/></div><h3>Crear respaldo completo</h3><p>Incluye inventario, movimientos, ventas, clientes, solicitudes, cotizaciones, campañas, catálogo y configuración en un archivo JSON legible.</p><button className="button button-dark" onClick={makeBackup}><Download size={16}/> Guardar respaldo</button><small>Guárdalo dentro del proyecto, en `backups/`. Esa carpeta quedará excluida de Git.</small></section>}
      {canImport&&<section className="panel backup-card"><div className="backup-card-icon"><FileUp size={20}/></div><h3>Recuperar o combinar respaldo</h3><p>Revisa el archivo antes de aplicarlo. La combinación agrega registros faltantes y conserva los locales en cualquier conflicto.</p><label className="backup-file-input">Seleccionar respaldo JSON<input type="file" accept=".json,application/json" onChange={(event) => readBackup(event.target.files?.[0])}/></label>{pendingBackup&&<div className="backup-preview"><b>{pendingBackup.fileName}</b><span>Exportado: {pendingBackup.exportedAt ? new Date(pendingBackup.exportedAt).toLocaleString('es-EC') : 'Fecha no registrada'}</span><span>{Object.values(pendingBackup.recordCounts).reduce((sum,value)=>sum+value,0)} registros · modo seguro: solo agregar y conservar conflictos</span><button className="button button-outline" onClick={importMerge}>Combinar sin sobrescribir</button></div>}</section>}
    </div>
    {error&&<div className="backup-message error"><AlertCircle size={17}/>{error}</div>}
    {lastImport&&<section className="panel backup-result"><h3><CheckCircle2 size={18}/> Respaldo combinado</h3><p>{lastImport.fileName}; los registros locales con IDs coincidentes se conservaron.</p><div className="backup-result-grid">{Object.entries(lastImport.summary).filter(([,result])=>result.added||result.conflicts).map(([name,result])=><span key={name}><b>{name}</b> · +{result.added} agregados · {result.conflicts} conflictos conservados</span>)}</div></section>}
    <section className="panel backup-plan"><span className="eyebrow">SECUENCIA DE CONEXIÓN</span><h3>Cuando GitHub, Supabase y Vercel estén listos</h3><ol><li>Crear y guardar respaldos del navegador donde existan datos; registrar fecha y número de filas.</li><li>Revisar el proyecto Supabase y su estado real antes de diseñar la primera migración; no aplicar SQL a ciegas.</li><li>Crear migraciones versionadas desde la CLI, revisar RLS y roles con datos de prueba, y desplegar primero en un entorno separado.</li><li>Importar con IDs de origen e idempotencia; cotejar cantidades, relaciones y totales antes del cambio de lectura/escritura.</li><li>Conservar respaldos previos y definir vuelta atrás antes de mover el uso diario.</li></ol><p className="backup-caveat">Ninguna conexión se ha realizado. No coloques archivos de respaldo ni secretos en GitHub.</p></section>
  </div>;
}
