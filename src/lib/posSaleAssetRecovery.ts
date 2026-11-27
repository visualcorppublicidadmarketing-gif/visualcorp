import type { CommercialAssetDraft } from './commercialAssets';

const DATABASE_NAME = 'visualcorp-pos-asset-recovery';
const DATABASE_VERSION = 1;
const STORE_NAME = 'checkout-drafts';

type StoredAsset = {
  id: string;
  kind: 'image' | 'link';
  title: string;
  description: string;
  fileName?: string;
  fileType?: string;
  fileLastModified?: number;
  fileBlob?: Blob;
  url?: string;
};

export type POSSaleAssetRecoveryRecord = {
  scopeKey: string;
  idempotencyKey: string | null;
  updatedAt: number;
  assets: StoredAsset[];
  operationRecordKey?: string;
};

export type POSSaleAssetRecoveryAdapter = {
  get: (scopeKey: string) => Promise<POSSaleAssetRecoveryRecord | null>;
  put: (record: POSSaleAssetRecoveryRecord) => Promise<void>;
  delete: (scopeKey: string) => Promise<void>;
};

function browserAdapter(): POSSaleAssetRecoveryAdapter {
  const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite guardar adjuntos de forma recuperable.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'scopeKey' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local de adjuntos.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas del POS para actualizar el almacenamiento de adjuntos.'));
  });

  const run = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T> | void) => {
    const database = await openDatabase();
    try {
      return await new Promise<T | void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        let result: T | undefined;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo actualizar el borrador de adjuntos.'));
        transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado de adjuntos.'));
        try {
          const request = operation(transaction.objectStore(STORE_NAME));
          if (request) {
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error || new Error('No se pudo leer el borrador de adjuntos.'));
          }
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    } finally {
      database.close();
    }
  };

  return {
    get: async (scopeKey) => (await run<POSSaleAssetRecoveryRecord | undefined>('readonly', (store) => store.get(scopeKey))) || null,
    put: async (record) => { await run('readwrite', (store) => store.put(record)); },
    delete: async (scopeKey) => { await run('readwrite', (store) => store.delete(scopeKey)); },
  };
}

function assertScopeKey(scopeKey: string) {
  if (!scopeKey || scopeKey.length > 500) throw new Error('No se pudo identificar de forma segura el borrador de adjuntos.');
}

export function createPOSSaleAssetRecoveryStore(adapter: POSSaleAssetRecoveryAdapter = browserAdapter()) {
  return {
    async load(scopeKey: string, operationKey?: string): Promise<{ idempotencyKey: string | null; updatedAt: number; assets: CommercialAssetDraft[] } | null> {
      assertScopeKey(scopeKey);
      const pointer = await adapter.get(operationKey ? `${scopeKey}:operation:${operationKey}` : scopeKey);
      const record = pointer?.operationRecordKey ? await adapter.get(pointer.operationRecordKey) : pointer;
      if (!record) return null;
      if (!Array.isArray(record.assets) || record.assets.length > 40) throw new Error('El borrador guardado de adjuntos no tiene un formato válido.');
      const assets = record.assets.map((asset): CommercialAssetDraft => {
        if (!asset?.id || (asset.kind !== 'image' && asset.kind !== 'link')) throw new Error('El borrador guardado contiene un adjunto inválido.');
        if (asset.kind === 'link') return { id: asset.id, kind: 'link', title: String(asset.title || ''), description: String(asset.description || ''), url: String(asset.url || '') };
        if (!asset.fileBlob || asset.fileBlob.size < 1 || asset.fileBlob.size > 10 * 1024 * 1024) throw new Error('Una imagen recuperada está vacía o supera el tamaño permitido.');
        if (typeof File === 'undefined') throw new Error('Este navegador no puede reconstruir los archivos adjuntos guardados.');
        const filename = String(asset.fileName || 'adjunto.webp');
        const file = new File([asset.fileBlob], filename, { type: asset.fileType || asset.fileBlob.type || 'image/webp', lastModified: Number(asset.fileLastModified) || Date.now() });
        return { id: asset.id, kind: 'image', title: String(asset.title || filename), description: String(asset.description || ''), file };
      });
      return { idempotencyKey: record.idempotencyKey || null, updatedAt: Number(record.updatedAt) || 0, assets };
    },

    async save(scopeKey: string, assets: CommercialAssetDraft[], idempotencyKey: string | null = null) {
      assertScopeKey(scopeKey);
      if (!Array.isArray(assets) || assets.length > 40) throw new Error('Hay demasiados adjuntos en este borrador.');
      if (!assets.length && !idempotencyKey) {
        await adapter.delete(scopeKey);
        return;
      }
      const storedAssets = assets.map((asset): StoredAsset => {
        if (!asset?.id || (asset.kind !== 'image' && asset.kind !== 'link')) throw new Error('No se puede recuperar un adjunto con formato inválido.');
        if (asset.kind === 'link') return { id: asset.id, kind: 'link', title: asset.title.slice(0, 160), description: asset.description.slice(0, 500), url: String(asset.url || '') };
        if (!asset.file || asset.file.size < 1 || asset.file.size > 10 * 1024 * 1024) throw new Error(`La imagen ${asset.title || asset.file?.name || ''} no está lista o supera 10 MB.`);
        return { id: asset.id, kind: 'image', title: asset.title.slice(0, 160), description: asset.description.slice(0, 500), fileName: asset.file.name, fileType: asset.file.type || 'image/webp', fileLastModified: asset.file.lastModified, fileBlob: asset.file };
      });
      const operationRecordKey = idempotencyKey ? `${scopeKey}:operation:${idempotencyKey}` : scopeKey;
      await adapter.put({ scopeKey: operationRecordKey, idempotencyKey: idempotencyKey || null, updatedAt: Date.now(), assets: storedAssets });
      // The pointer is only a convenience. Every committed operation keeps its own Blob record.
      if (idempotencyKey) await adapter.put({ scopeKey, idempotencyKey, operationRecordKey, updatedAt: Date.now(), assets: [] });
    },

    async clear(scopeKey: string, operationKey?: string) {
      assertScopeKey(scopeKey);
      const pointer = await adapter.get(scopeKey);
      const operationRecordKey = operationKey ? `${scopeKey}:operation:${operationKey}` : pointer?.operationRecordKey;
      if (operationRecordKey) await adapter.delete(operationRecordKey);
      if (!operationKey || pointer?.idempotencyKey === operationKey) await adapter.delete(scopeKey);
    },
  };
}

export const posSaleAssetRecovery = createPOSSaleAssetRecoveryStore();
