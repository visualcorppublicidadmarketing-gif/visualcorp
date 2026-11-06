import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type StoredFavorites = { ids: string[]; localOnly: boolean; removedIds: string[] };
type FavoriteStatus = 'loading' | 'synced' | 'local';

function readStored(key: string): StoredFavorites {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (Array.isArray(parsed)) return { ids: parsed.filter((value) => typeof value === 'string'), localOnly: true, removedIds: [] };
    if (parsed && Array.isArray(parsed.ids)) return { ids: parsed.ids.filter((value: unknown) => typeof value === 'string'), localOnly: parsed.localOnly !== false, removedIds: Array.isArray(parsed.removedIds) ? parsed.removedIds.filter((value: unknown) => typeof value === 'string') : [] };
  } catch { /* Private browsing or malformed storage: start empty. */ }
  return { ids: [], localOnly: true, removedIds: [] };
}

function writeStored(key: string, value: StoredFavorites) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Remote favorites remain available when local storage is blocked. */ }
}

export function useAdvisorProductFavorites(organizationId?: string | null, advisorId?: string | null) {
  const scopeKey = organizationId && advisorId ? `${organizationId}:${advisorId}` : 'unavailable';
  const storageKey = `visualcorp:advisor-product-favorites:${scopeKey}`;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set(readStored(storageKey).ids));
  const [status, setStatus] = useState<FavoriteStatus>('loading');
  const favoriteIdsRef = useRef(favoriteIds);
  const statusRef = useRef(status);
  const queueRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => { favoriteIdsRef.current = favoriteIds; }, [favoriteIds]);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    let active = true;
    const stored = readStored(storageKey);
    const localIds = new Set(stored.ids);
    favoriteIdsRef.current = localIds;
    setFavoriteIds(localIds);
    if (!organizationId || !advisorId || !supabase) {
      setStatus('local');
      return () => { active = false; };
    }

    setStatus('loading');
    void Promise.resolve(supabase.from('advisor_product_favorites')
      .select('catalog_product_id')
      .eq('organization_id', organizationId)
      .eq('advisor_id', advisorId))
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) { setStatus('local'); return; }
        const latestStored = readStored(storageKey);
        const pendingLocalIds = latestStored.localOnly ? new Set(latestStored.ids) : localIds;
        const pendingRemovedIds = latestStored.localOnly ? new Set(latestStored.removedIds) : new Set<string>();
        const remoteIds = new Set((data || []).map((row) => String(row.catalog_product_id)));
        const mergedIds = latestStored.localOnly ? new Set([...remoteIds, ...pendingLocalIds].filter((id) => !pendingRemovedIds.has(id))) : remoteIds;
        favoriteIdsRef.current = mergedIds;
        setFavoriteIds(mergedIds);
        if (latestStored.localOnly && pendingLocalIds.size) {
          const unsynced = [...pendingLocalIds].filter((id) => !remoteIds.has(id));
          if (unsynced.length) {
            const { error: syncError } = await supabase.from('advisor_product_favorites').upsert(
              unsynced.map((catalog_product_id) => ({ organization_id: organizationId, advisor_id: advisorId, catalog_product_id })),
              { onConflict: 'organization_id,advisor_id,catalog_product_id', ignoreDuplicates: true },
            );
            if (syncError) { setStatus('local'); writeStored(storageKey, { ids: [...mergedIds], localOnly: true, removedIds: [...pendingRemovedIds] }); return; }
          }
        }
        if (latestStored.localOnly && pendingRemovedIds.size) {
          const toRemove = [...pendingRemovedIds].filter((id) => remoteIds.has(id));
          if (toRemove.length) {
            const { error: removeError } = await supabase.from('advisor_product_favorites').delete()
              .eq('organization_id', organizationId).eq('advisor_id', advisorId).in('catalog_product_id', toRemove);
            if (removeError) { setStatus('local'); writeStored(storageKey, { ids: [...mergedIds], localOnly: true, removedIds: [...pendingRemovedIds] }); return; }
          }
        }
        writeStored(storageKey, { ids: [...mergedIds], localOnly: false, removedIds: [] });
        setStatus('synced');
      })
      .catch(() => { if (active) setStatus('local'); });
    return () => { active = false; };
  }, [storageKey, organizationId, advisorId]);

  const toggleFavorite = useCallback((productId: string) => {
    if (!productId) return;
    const nextIds = new Set(favoriteIdsRef.current);
    const shouldFavorite = !nextIds.has(productId);
    if (shouldFavorite) nextIds.add(productId); else nextIds.delete(productId);
    favoriteIdsRef.current = nextIds;
    setFavoriteIds(nextIds);
    const stored = readStored(storageKey);
    const removedIds = new Set(stored.removedIds);
    if (shouldFavorite) removedIds.delete(productId); else removedIds.add(productId);
    writeStored(storageKey, { ids: [...nextIds], localOnly: true, removedIds: [...removedIds] });

    if (statusRef.current !== 'synced' || !organizationId || !advisorId || !supabase) return;
    const previous = queueRef.current.get(productId) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      if (shouldFavorite) {
        const { error } = await supabase.from('advisor_product_favorites').upsert(
          { organization_id: organizationId, advisor_id: advisorId, catalog_product_id: productId },
          { onConflict: 'organization_id,advisor_id,catalog_product_id', ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from('advisor_product_favorites').delete()
          .eq('organization_id', organizationId).eq('advisor_id', advisorId).eq('catalog_product_id', productId);
        if (error) throw error;
      }
    }).catch(() => {
      statusRef.current = 'local';
      setStatus('local');
      const latest = readStored(storageKey);
      const pendingRemovals = new Set(latest.removedIds);
      if (favoriteIdsRef.current.has(productId)) pendingRemovals.delete(productId); else pendingRemovals.add(productId);
      writeStored(storageKey, { ids: [...favoriteIdsRef.current], localOnly: true, removedIds: [...pendingRemovals] });
    });
    queueRef.current.set(productId, operation);
    void operation.finally(() => { if (queueRef.current.get(productId) === operation) queueRef.current.delete(productId); });
  }, [storageKey, organizationId, advisorId]);

  return { favoriteIds, toggleFavorite, status };
}
