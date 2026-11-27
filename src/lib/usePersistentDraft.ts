import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export type StoredDraftPayload<T> = {
  value: T;
  savedAt: number;
};

export type PersistentDraftOptions<T> = {
  orgId?: string | null;
  draftKey: string;
  serverValue: T;
  isEqual?: (a: T, b: T) => boolean;
  enabled?: boolean;
};

export type PersistentDraftResult<T> = {
  draft: T;
  setDraft: Dispatch<SetStateAction<T>>;
  isDirty: boolean;
  draftSavedAt: number | null;
  isRecovered: boolean;
  pendingRecovery: StoredDraftPayload<T> | null;
  recoverDraft: () => void;
  dismissRecovery: () => void;
  discardDraft: () => void;
  markSaved: (savedValue?: T) => void;
};

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  return stableSerialize(a) === stableSerialize(b);
}

function readStoredDraft<T>(storageKey: string): StoredDraftPayload<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraftPayload<T>>;
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed) || typeof parsed.savedAt !== 'number') {
      return null;
    }
    return { value: parsed.value as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

function writeStoredDraft<T>(storageKey: string, payload: StoredDraftPayload<T>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors.
  }
}

function removeStoredDraft(storageKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage removal errors.
  }
}

/**
 * Shared persistent local draft hook for website admin editors.
 * Keeps local edits across reloads, protects dirty state against late remote hydration,
 * prompts recovery after reload, and registers `beforeunload` warning when dirty.
 */
export function usePersistentDraft<T>({
  orgId,
  draftKey,
  serverValue,
  isEqual = defaultIsEqual,
  enabled = true,
}: PersistentDraftOptions<T>): PersistentDraftResult<T> {
  const storageKey = useMemo(() => {
    if (!enabled || !orgId || !draftKey) return null;
    return `vc-admin-draft:${orgId}:${draftKey}`;
  }, [enabled, orgId, draftKey]);

  const [draft, setDraftState] = useState<T>(serverValue);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [isRecovered, setIsRecovered] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<StoredDraftPayload<T> | null>(null);

  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const serverValueRef = useRef(serverValue);
  serverValueRef.current = serverValue;

  const isDirty = useMemo(() => !isEqualRef.current(draft, serverValue), [draft, serverValue]);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const isRecoveredRef = useRef(isRecovered);
  isRecoveredRef.current = isRecovered;

  const prevStorageKeyRef = useRef<string | null>(null);
  const serverSerialized = useMemo(() => stableSerialize(serverValue), [serverValue]);
  const lastServerSerializedRef = useRef(serverSerialized);

  // Inspect stored local draft when storageKey initializes or switches (e.g. product/article change).
  useEffect(() => {
    const keyChanged = prevStorageKeyRef.current !== storageKey;
    prevStorageKeyRef.current = storageKey;

    if (!storageKey) {
      if (keyChanged) {
        setDraftState(serverValueRef.current);
        setDraftSavedAt(null);
        setIsRecovered(false);
        setPendingRecovery(null);
      }
      return;
    }

    if (keyChanged) {
      setDraftState(serverValueRef.current);
      setIsRecovered(false);
      setDraftSavedAt(null);
      lastServerSerializedRef.current = stableSerialize(serverValueRef.current);
      const stored = readStoredDraft<T>(storageKey);
      if (stored && !isEqualRef.current(stored.value, serverValueRef.current)) {
        setPendingRecovery(stored);
      } else {
        if (stored) removeStoredDraft(storageKey);
        setPendingRecovery(null);
      }
    }
  }, [storageKey]);

  // Hydration guard: only sync clean editors when serverValue updates asynchronously.
  useEffect(() => {
    if (lastServerSerializedRef.current === serverSerialized) return;
    lastServerSerializedRef.current = serverSerialized;

    if (!isDirtyRef.current && !isRecoveredRef.current) {
      setDraftState(serverValueRef.current);
      setDraftSavedAt(null);
      if (storageKey) {
        const stored = readStoredDraft<T>(storageKey);
        if (stored && !isEqualRef.current(stored.value, serverValueRef.current)) {
          setPendingRecovery(stored);
        } else {
          if (stored) removeStoredDraft(storageKey);
          setPendingRecovery(null);
        }
      }
    } else if (storageKey && pendingRecovery && isEqualRef.current(pendingRecovery.value, serverValueRef.current)) {
      removeStoredDraft(storageKey);
      setPendingRecovery(null);
    }
  }, [serverSerialized, storageKey, pendingRecovery]);

  // Persist dirty draft changes to localStorage, or clean storage when returning to server baseline.
  const setDraft: Dispatch<SetStateAction<T>> = useCallback((updater) => {
    setDraftState((current) => {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(current) : updater;
      const dirty = !isEqualRef.current(next, serverValueRef.current);
      if (storageKey) {
        if (dirty) {
          const savedAt = Date.now();
          writeStoredDraft(storageKey, { value: next, savedAt });
          setDraftSavedAt(savedAt);
        } else {
          removeStoredDraft(storageKey);
          setDraftSavedAt(null);
          setIsRecovered(false);
        }
      }
      if (dirty) {
        setPendingRecovery(null);
      }
      return next;
    });
  }, [storageKey]);

  const recoverDraft = useCallback(() => {
    if (!pendingRecovery) return;
    setDraftState(pendingRecovery.value);
    setDraftSavedAt(pendingRecovery.savedAt);
    setIsRecovered(true);
    setPendingRecovery(null);
  }, [pendingRecovery]);

  const dismissRecovery = useCallback(() => {
    if (storageKey) removeStoredDraft(storageKey);
    setPendingRecovery(null);
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    if (storageKey) removeStoredDraft(storageKey);
    setDraftState(serverValueRef.current);
    setDraftSavedAt(null);
    setIsRecovered(false);
    setPendingRecovery(null);
  }, [storageKey]);

  const markSaved = useCallback((savedValue?: T) => {
    if (storageKey) removeStoredDraft(storageKey);
    const baseline = savedValue !== undefined ? savedValue : serverValueRef.current;
    lastServerSerializedRef.current = stableSerialize(baseline);
    setDraftState(baseline);
    setDraftSavedAt(null);
    setIsRecovered(false);
    setPendingRecovery(null);
  }, [storageKey]);

  // Warn before closing or reloading tab while local edits are unpublished.
  useEffect(() => {
    if (!enabled || !isDirty || typeof window === 'undefined') return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, isDirty]);

  return {
    draft,
    setDraft,
    isDirty,
    draftSavedAt,
    isRecovered,
    pendingRecovery,
    recoverDraft,
    dismissRecovery,
    discardDraft,
    markSaved,
  };
}
