import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { supabase } from '../../../lib/supabaseClient';
import { createBoxProjectFile, normalizeBoxProject, type BoxProject } from './boxModel';

const TABLE = 'box_generator_designs';
const BUCKET = 'box-generator-designs';
const MAX_PROJECT_BYTES = 25 * 1024 * 1024;

interface BoxDesignRecord {
  id: string;
  organization_id: string;
  title: string;
  storage_path: string;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface BoxDesignLibraryProps {
  project: BoxProject;
  onLoad: (project: BoxProject) => void;
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'No se pudo sincronizar el diseño.';
}

export function BoxDesignLibrary({ project, onLoad }: BoxDesignLibraryProps) {
  const { organizationId, user, hasPermission } = useAuth();
  const canView = hasPermission('workshop', 'view') || hasPermission('workshop', 'edit');
  const canEdit = hasPermission('workshop', 'edit');
  const [designs, setDesigns] = useState<BoxDesignRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [activeDesign, setActiveDesign] = useState<BoxDesignRecord | null>(null);
  const [remoteRevision, setRemoteRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('');
  const activeDesignRef = useRef<BoxDesignRecord | null>(null);
  const savingDesignIdRef = useRef<string | null>(null);

  const setActive = (record: BoxDesignRecord | null) => {
    activeDesignRef.current = record;
    setActiveDesign(record);
  };

  const refreshDesigns = useCallback(async () => {
    if (!supabase || !organizationId || !canView) return;
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    setDesigns((data ?? []) as BoxDesignRecord[]);
  }, [organizationId, canView]);

  useEffect(() => {
    if (!supabase || !organizationId || !canView) return undefined;
    let alive = true;
    void refreshDesigns().catch((error) => {
      if (alive) setNotice(`Biblioteca compartida no disponible: ${messageFor(error)}`);
    });
    const channel = supabase
      .channel(`box-generator-designs-${organizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: TABLE,
        filter: `organization_id=eq.${organizationId}`,
      }, (payload) => {
        const changed = (payload.new ?? payload.old) as Partial<BoxDesignRecord>;
        const active = activeDesignRef.current;
        if (changed.id && active?.id === changed.id && Number(changed.revision) > active.revision && savingDesignIdRef.current !== changed.id) {
          setRemoteRevision(Number(changed.revision));
          setNotice('Este diseño tiene una versión guardada desde otro dispositivo. Revisa antes de reemplazar tus cambios locales.');
        }
        void refreshDesigns().catch(() => setNotice('No se pudo actualizar la lista compartida. Usa «Actualizar lista» para reintentar.'));
      })
      .subscribe((status) => {
        if (alive) setConnected(status === 'SUBSCRIBED');
      });
    return () => {
      alive = false;
      setConnected(false);
      void supabase?.removeChannel(channel);
    };
  }, [organizationId, canView, refreshDesigns]);

  const readDesign = async (id: string) => {
    if (!supabase || !organizationId) throw new Error('No hay una sesión de organización activa.');
    const { data: row, error: rowError } = await supabase
      .from(TABLE)
      .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) throw new Error('El diseño ya no está disponible en la biblioteca.');
    const record = row as BoxDesignRecord;
    const { data: file, error: fileError } = await supabase.storage.from(BUCKET).download(record.storage_path);
    if (fileError) throw fileError;
    const projectData = JSON.parse(await file.text());
    return { project: normalizeBoxProject(projectData), record };
  };

  const openDesign = async (id = selectedId) => {
    if (!id) return;
    setBusy(true);
    setNotice('Abriendo diseño compartido…');
    try {
      const result = await readDesign(id);
      onLoad(result.project);
      setSelectedId(result.record.id);
      setActive(result.record);
      setRemoteRevision(null);
      setNotice(`Diseño «${result.record.title}» abierto · versión ${result.record.revision}.`);
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const saveDesign = async (asNew: boolean) => {
    if (!supabase || !organizationId || !user?.id || !canEdit) {
      setNotice('Tu perfil no tiene permiso para guardar diseños compartidos.');
      return;
    }
    const title = project.title.trim();
    if (!title) { setNotice('Escribe un nombre antes de guardar el diseño.'); return; }
    const previous = asNew ? null : activeDesign;
    const id = previous?.id ?? crypto.randomUUID();
    const revision = previous ? previous.revision + 1 : 1;
    const storagePath = `${organizationId}/${id}/${crypto.randomUUID()}.vcbox.json`;
    const content = createBoxProjectFile(project);
    const file = new Blob([content], { type: 'application/json' });
    if (file.size > MAX_PROJECT_BYTES) {
      setNotice('El archivo del diseño supera el límite de 25 MB para la biblioteca compartida. Reduce o elimina imágenes del proyecto.');
      return;
    }

    setBusy(true);
    setNotice('Guardando diseño compartido…');
    savingDesignIdRef.current = id;
    let committed = false;
    let committedRecord: BoxDesignRecord | null = null;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
        contentType: 'application/json',
        cacheControl: '0',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const payload = {
        id,
        organization_id: organizationId,
        title,
        storage_path: storagePath,
        revision,
        created_by: previous?.created_by ?? user.id,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      let saved: BoxDesignRecord | null = null;
      if (previous) {
        const { data, error } = await supabase
          .from(TABLE)
          .update({ title, storage_path: storagePath, revision, updated_by: user.id, updated_at: payload.updated_at })
          .eq('organization_id', organizationId)
          .eq('id', id)
          .eq('revision', previous.revision)
          .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
          .maybeSingle();
        if (error) {
          // A transport failure can happen after Postgres commits. Reconcile the
          // pointer before deleting the freshly uploaded immutable snapshot.
          const { data: current, error: reconcileError } = await supabase
            .from(TABLE)
            .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('id', id)
            .maybeSingle();
          if (reconcileError) throw new Error('No pude confirmar si el guardado se completó. El archivo remoto se conserva para evitar perder una versión; actualiza la lista antes de volver a guardar.');
          if (current?.storage_path === storagePath) {
            saved = current as BoxDesignRecord;
          } else {
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
            if (Number(current?.revision) > previous.revision) {
              setRemoteRevision(Number(current!.revision));
              throw new Error(cleanupError
                ? 'Otra persona guardó una versión antes. La carga temporal quedó pendiente de limpieza; carga la versión remota antes de reintentar.'
                : 'Otra persona guardó una versión antes. Carga la versión remota para revisar y vuelve a guardar.');
            }
            throw error;
          }
        } else if (!data) {
          const { data: current, error: reconcileError } = await supabase
            .from(TABLE)
            .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('id', id)
            .maybeSingle();
          if (reconcileError) throw new Error('No pude confirmar si el guardado se completó. El archivo remoto se conserva para evitar perder una versión; actualiza la lista antes de volver a guardar.');
          if (current?.storage_path === storagePath) {
            saved = current as BoxDesignRecord;
          } else {
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
            setRemoteRevision(Number(current?.revision) || previous.revision + 1);
            throw new Error(cleanupError
              ? 'Otra persona guardó una versión antes. La carga temporal quedó pendiente de limpieza; carga la versión remota antes de reintentar.'
              : 'Otra persona guardó una versión antes. Carga la versión remota para revisar y vuelve a guardar.');
          }
        } else {
          saved = data as BoxDesignRecord;
        }
      } else {
        const { data, error } = await supabase
          .from(TABLE)
          .insert(payload)
          .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
          .maybeSingle();
        if (error) {
          const { data: current, error: reconcileError } = await supabase
            .from(TABLE)
            .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('id', id)
            .maybeSingle();
          if (reconcileError) throw new Error('No pude confirmar si el diseño se creó. El archivo remoto se conserva para evitar perder una versión; actualiza la lista antes de volver a guardar.');
          if (current?.storage_path === storagePath) {
            saved = current as BoxDesignRecord;
          } else {
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
            throw cleanupError ? new Error(`${error.message} Además, la carga temporal quedó pendiente de limpieza.`) : error;
          }
        } else if (!data) {
          const { data: current, error: reconcileError } = await supabase
            .from(TABLE)
            .select('id,organization_id,title,storage_path,revision,created_by,updated_by,created_at,updated_at')
            .eq('organization_id', organizationId)
            .eq('id', id)
            .maybeSingle();
          if (reconcileError) throw new Error('No pude confirmar si el diseño se creó. El archivo remoto se conserva para evitar perder una versión; actualiza la lista antes de volver a guardar.');
          if (current?.storage_path === storagePath) {
            saved = current as BoxDesignRecord;
          } else {
            const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
            throw cleanupError
              ? new Error('No se confirmó el diseño y el archivo temporal quedó pendiente de limpieza. Actualiza la lista antes de volver a guardar.')
              : new Error('No se recibió confirmación del diseño creado. Actualiza la lista antes de volver a guardar.');
          }
        } else {
          saved = data as BoxDesignRecord;
        }
      }

      if (!saved) throw new Error('No se pudo confirmar la versión guardada.');
      committed = true;
      committedRecord = saved;
      setActive(saved);
      setSelectedId(saved.id);
      setRemoteRevision(null);
      let cleanupWarning = '';
      if (previous && previous.storage_path !== saved.storage_path) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([previous.storage_path]);
        if (cleanupError) cleanupWarning = ' La versión anterior sigue en almacenamiento y requiere limpieza.';
      }
      let refreshWarning = '';
      try { await refreshDesigns(); } catch { refreshWarning = ' La lista no se actualizó; puedes volver a consultarla.'; }
      setNotice(`Diseño «${saved.title}» sincronizado · versión ${saved.revision}.${cleanupWarning}${refreshWarning}`);
    } catch (error) {
      setNotice(committed && committedRecord
        ? `El diseño «${committedRecord.title}» sí quedó guardado · versión ${committedRecord.revision}. ${messageFor(error)}`
        : messageFor(error));
    } finally {
      savingDesignIdRef.current = null;
      setBusy(false);
    }
  };

  if (!canView) return null;

  return (
    <section className="box-generator__cloud-library" aria-labelledby="box-cloud-library-title">
      <div className="box-generator__cloud-heading">
        <div>
          <span className="box-generator__section-index">NUBE</span>
          <h2 id="box-cloud-library-title">Biblioteca compartida</h2>
        </div>
        <span className={`box-generator__cloud-status ${connected ? 'is-connected' : ''}`} aria-label={connected ? 'Sincronización en vivo activa' : 'Sincronización en vivo desconectada'}>
          <i aria-hidden="true" /> {connected ? 'En vivo' : 'Sin conexión en vivo'}
        </span>
      </div>
      <p className="box-generator__cloud-description">Guarda el archivo del proyecto para abrirlo en otros dispositivos de Visual Corp. Los cambios locales solo se comparten al guardar.</p>
      <div className="box-generator__cloud-open-row">
        <label className="box-generator__dimension-field">
          <span>Diseños de la organización</span>
          <select className="box-generator__select" value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)} disabled={busy}>
            <option value="">Selecciona un diseño guardado</option>
            {designs.map((design) => <option key={design.id} value={design.id}>{design.title} · v{design.revision}</option>)}
          </select>
        </label>
        <button type="button" className="button button-outline" onClick={() => void openDesign()} disabled={busy || !selectedId}>Abrir</button>
        <button type="button" className="button button-outline" onClick={() => void refreshDesigns().then(() => setNotice('Lista compartida actualizada.')).catch((error) => setNotice(messageFor(error)))} disabled={busy}>Actualizar lista</button>
      </div>
      <div className="box-generator__cloud-actions">
        <button type="button" className="button button-primary" onClick={() => void saveDesign(true)} disabled={busy || !canEdit}>Guardar como diseño nuevo</button>
        <button type="button" className="button button-outline" onClick={() => void saveDesign(false)} disabled={busy || !canEdit || !activeDesign}>Guardar cambios</button>
        {activeDesign && <span>Abierto: {activeDesign.title} · v{activeDesign.revision}</span>}
      </div>
      {remoteRevision !== null && activeDesign && (
        <div className="box-generator__cloud-conflict" role="alert">
          <span>Hay una versión v{remoteRevision} en la nube. Cargarla reemplazará los cambios locales sin guardar.</span>
          <button type="button" className="button button-outline" onClick={() => void openDesign(activeDesign.id)} disabled={busy}>Cargar versión remota</button>
        </div>
      )}
      <p className="box-generator__cloud-notice" role="status" aria-live="polite">{busy ? 'Procesando…' : notice || (canEdit ? 'Biblioteca privada de la organización.' : 'Tienes permiso de lectura; un perfil con edición puede guardar diseños.')}</p>
    </section>
  );
}
