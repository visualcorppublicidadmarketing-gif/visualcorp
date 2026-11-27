import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { syncManualAccessCookie } from './manualAccessCookie';

export type AccessProfile = { key: string; name: string; role: string };
export type PermissionMap = Record<string, Record<string, boolean>>;
export type BranchScope = {
  branch_id: string | null;
  branch_name: string | null;
  branch_code: string | null;
  role: string;
  profile_key: string;
  permissions: PermissionMap;
};
export type WorkHourEntry = {
  weekday: number;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
};
export type WorkExceptionEntry = {
  work_date: string;
  kind: 'open' | 'closed';
  opens_at: string | null;
  closes_at: string | null;
  note: string;
  personal: boolean;
} | null;

type AccessRequestStatus = 'idle' | 'recorded' | 'dismissed' | 'unavailable' | 'error';

export type AuthContextValue = {
  session: any;
  user: any;
  roles: string[];
  profiles: AccessProfile[];
  permissions: PermissionMap;
  branchScopes: BranchScope[];
  organizationId: string | null;
  loading: boolean;
  accessError: string;
  accessRequestStatus: AccessRequestStatus;
  workAccessOpen: boolean;
  workHours: WorkHourEntry[];
  workException: WorkExceptionEntry;
  refreshAccess: (currentSession?: any) => Promise<void>;
  hasPermission: (module: string, action: string, branchId?: string | null) => boolean;
  allowedBranchIds: (module: string, action: string) => string[] | null;
  sendSignInLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function scopeGrantsPermission(scope: BranchScope, module: string, action: string): boolean {
  if (scope.role === 'owner') return true;
  if (scope.permissions?.[module]?.[action] === true) return true;
  return action === 'view' && scope.permissions?.[module]?.edit === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [branchScopes, setBranchScopes] = useState<BranchScope[]>([]);
  const [hasScopePayload, setHasScopePayload] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workAccessOpen, setWorkAccessOpen] = useState(true);
  const [workHours, setWorkHours] = useState<WorkHourEntry[]>([]);
  const [workException, setWorkException] = useState<WorkExceptionEntry>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [accessError, setAccessError] = useState('');
  const [accessRequestStatus, setAccessRequestStatus] = useState<AccessRequestStatus>('idle');
  const sessionRef = useRef<any>(null);
  const accessRequestRef = useRef(0);
  const lastInvitationClaimAtRef = useRef(0);
  const recordedAccessRequestRef = useRef(false);

  const resetAccessState = useCallback((nextOrgId: string | null = null, keepScheduleOpen = true) => {
    setRoles([]);
    setProfiles([]);
    setPermissions({});
    setBranchScopes([]);
    setHasScopePayload(false);
    setOrganizationId(nextOrgId);
    if (keepScheduleOpen) {
      setWorkAccessOpen(true);
      setWorkHours([]);
      setWorkException(null);
    }
  }, []);

  const refreshAccess = useCallback(async (currentSession?: any) => {
    if (!supabase) { setLoading(false); return; }
    const previousSession = sessionRef.current;
    const nextSession = currentSession === undefined ? previousSession : currentSession;
    const userChanged = previousSession?.user?.id !== nextSession?.user?.id;
    const requestId = ++accessRequestRef.current;
    sessionRef.current = nextSession;
    setSession((previous: any) => previous?.user?.id === nextSession?.user?.id
      && previous?.access_token === nextSession?.access_token
      ? previous
      : nextSession);

    if (userChanged) {
      recordedAccessRequestRef.current = false;
      setAccessRequestStatus('idle');
    }

    if (!nextSession?.user) {
      syncManualAccessCookie(null, []);
      resetAccessState(null, true);
      setAccessError('');
      setLoading(false);
      return;
    }
    if (userChanged) {
      resetAccessState(null, true);
      setAccessError('');
      setLoading(true);
    }

    try {
      const now = Date.now();
      if (userChanged || now - lastInvitationClaimAtRef.current >= 30_000) {
        lastInvitationClaimAtRef.current = now;
        try { await supabase.rpc('claim_organization_access_invitations'); } catch { /* Access loading still uses the existing permission check. */ }
        if (requestId !== accessRequestRef.current) return;
      }
      const { data, error } = await supabase.rpc('get_my_visualcorp_access');
      if (requestId !== accessRequestRef.current) return;
      if (error) {
        syncManualAccessCookie(null, []);
        resetAccessState(null, false);
        setAccessError('No pudimos comprobar tus permisos. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      const access = data || {};
      const scheduleAllowsAccess = access.work_access_open !== false;
      const nextWorkHours: WorkHourEntry[] = Array.isArray(access.work_hours) ? access.work_hours : [];
      const nextWorkException: WorkExceptionEntry = access.work_exception || null;
      setWorkAccessOpen(scheduleAllowsAccess);
      setWorkHours((previous) => JSON.stringify(previous) === JSON.stringify(nextWorkHours) ? previous : nextWorkHours);
      setWorkException((previous) => JSON.stringify(previous) === JSON.stringify(nextWorkException) ? previous : nextWorkException);

      const assigned: AccessProfile[] = Array.isArray(access.roles) ? access.roles : [];
      const nextRoles = scheduleAllowsAccess ? [...new Set<string>(assigned.map((profile) => profile.role).filter(Boolean))] : [];
      if (!scheduleAllowsAccess) {
        syncManualAccessCookie(null, []);
        resetAccessState(access.organization_id || null, false);
        setAccessError('');
        return;
      }
      if (assigned.length) {
        recordedAccessRequestRef.current = false;
        setAccessRequestStatus('idle');
      } else if (!recordedAccessRequestRef.current) {
        const metadata = nextSession.user.app_metadata;
        const usesGoogle = metadata?.provider === 'google' || metadata?.providers?.includes('google');
        if (usesGoogle) {
          let status: AccessRequestStatus = 'error';
          try {
            const { data: request, error: requestError } = await supabase.rpc('record_my_access_request');
            if (!requestError && request?.status === 'recorded') status = 'recorded';
            if (!requestError && request?.status === 'dismissed') status = 'dismissed';
            if (!requestError && request?.status === 'already_has_access') status = 'unavailable';
          } catch { /* Keep the access check usable if recording fails. */ }
          if (requestId !== accessRequestRef.current) return;
          recordedAccessRequestRef.current = status === 'recorded';
          setAccessRequestStatus(status);
        } else {
          setAccessRequestStatus('unavailable');
        }
      }
      syncManualAccessCookie(nextSession, nextRoles);
      const nextPermissions: PermissionMap = access.permissions || {};
      const hasScopes = Array.isArray(access.branch_scopes);
      const nextBranchScopes: BranchScope[] = hasScopes ? access.branch_scopes : [];
      setProfiles((previous) => JSON.stringify(previous) === JSON.stringify(assigned) ? previous : assigned);
      setRoles((previous) => JSON.stringify(previous) === JSON.stringify(nextRoles) ? previous : nextRoles);
      setPermissions((previous) => JSON.stringify(previous) === JSON.stringify(nextPermissions) ? previous : nextPermissions);
      setBranchScopes((previous) => JSON.stringify(previous) === JSON.stringify(nextBranchScopes) ? previous : nextBranchScopes);
      setHasScopePayload(hasScopes);
      setOrganizationId(access.organization_id || null);
      setAccessError('');
    } catch {
      if (requestId === accessRequestRef.current) {
        syncManualAccessCookie(null, []);
        resetAccessState(null, false);
        setAccessError('No pudimos comprobar tus permisos. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (requestId === accessRequestRef.current) setLoading(false);
    }
  }, [resetAccessState]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let alive = true;
    let authEventSeen = false;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && !authEventSeen) void refreshAccess(data.session);
    }).catch(() => {
      if (alive && !authEventSeen) {
        setAccessError('No pudimos comprobar tus permisos. Revisa tu conexión e inténtalo de nuevo.');
        setLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      authEventSeen = true;
      if (alive) setTimeout(() => { if (alive) void refreshAccess(currentSession); }, 0);
    });
    let lastVisibleRefreshAt = 0;
    const refreshVisible = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - lastVisibleRefreshAt > 5_000) {
        lastVisibleRefreshAt = now;
        void refreshAccess();
      }
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshAccess(); }, 15_000);
    return () => {
      alive = false; listener.subscription.unsubscribe(); window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible); window.clearInterval(interval);
    };
  }, [refreshAccess]);

  const hasPermission = useCallback((module: string, action: string, branchId?: string | null): boolean => {
    if (hasScopePayload) {
      if (branchId === undefined) {
        return branchScopes.some((scope) => scopeGrantsPermission(scope, module, action));
      }
      if (branchId === null) {
        return branchScopes.some((scope) => scope.branch_id === null && scopeGrantsPermission(scope, module, action));
      }
      return branchScopes.some(
        (scope) => (scope.branch_id === null || scope.branch_id === branchId) && scopeGrantsPermission(scope, module, action),
      );
    }
    return roles.includes('owner') || permissions?.[module]?.[action] === true || (action === 'view' && permissions?.[module]?.edit === true);
  }, [hasScopePayload, branchScopes, roles, permissions]);

  const allowedBranchIds = useCallback((module: string, action: string): string[] | null => {
    if (hasScopePayload) {
      if (branchScopes.some((scope) => scope.branch_id === null && scopeGrantsPermission(scope, module, action))) {
        return null;
      }
      const ids = branchScopes
        .filter((scope) => Boolean(scope.branch_id) && scopeGrantsPermission(scope, module, action))
        .map((scope) => scope.branch_id as string);
      return [...new Set(ids)];
    }
    const allowed = roles.includes('owner') || permissions?.[module]?.[action] === true || (action === 'view' && permissions?.[module]?.edit === true);
    return allowed ? null : [];
  }, [hasScopePayload, branchScopes, roles, permissions]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user || null,
    roles,
    profiles,
    permissions,
    branchScopes,
    organizationId,
    loading,
    accessError,
    accessRequestStatus,
    workAccessOpen,
    workHours,
    workException,
    refreshAccess,
    hasPermission,
    allowedBranchIds,
    sendSignInLink: async (email: string) => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (error) throw error;
    },
    signInWithGoogle: async () => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (error) throw error;
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  }), [
    session,
    roles,
    profiles,
    permissions,
    branchScopes,
    organizationId,
    loading,
    accessError,
    accessRequestStatus,
    workAccessOpen,
    workHours,
    workException,
    refreshAccess,
    hasPermission,
    allowedBranchIds,
  ]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
