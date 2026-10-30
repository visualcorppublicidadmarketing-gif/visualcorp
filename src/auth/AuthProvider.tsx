import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { syncManualAccessCookie } from './manualAccessCookie';

type AccessProfile = { key: string; name: string; role: string };
type PermissionMap = Record<string, Record<string, boolean>>;
const AuthContext = createContext<any>(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [accessError, setAccessError] = useState('');
  const sessionRef = useRef<any>(null);
  const accessRequestRef = useRef(0);
  const lastInvitationClaimAtRef = useRef(0);

  const refreshAccess = useCallback(async (currentSession?: any) => {
    if (!supabase) { setLoading(false); return; }
    const previousSession = sessionRef.current;
    const nextSession = currentSession === undefined ? previousSession : currentSession;
    const userChanged = previousSession?.user?.id !== nextSession?.user?.id;
    const requestId = ++accessRequestRef.current;
    sessionRef.current = nextSession;
    setSession((previous) => previous?.user?.id === nextSession?.user?.id
      && previous?.access_token === nextSession?.access_token
      ? previous
      : nextSession);

    if (!nextSession?.user) {
      syncManualAccessCookie(null, []);
      setRoles([]); setProfiles([]); setPermissions({}); setOrganizationId(null); setAccessError(''); setLoading(false); return;
    }
    if (userChanged) {
      setRoles([]); setProfiles([]); setPermissions({}); setOrganizationId(null); setAccessError(''); setLoading(true);
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
        setAccessError('No pudimos comprobar tus permisos. Revisa tu conexión e inténtalo de nuevo.');
        return;
      }
      const access = data || {};
      const assigned = Array.isArray(access.roles) ? access.roles : [];
      const nextRoles = [...new Set<string>(assigned.map((profile: AccessProfile) => profile.role).filter(Boolean))];
      syncManualAccessCookie(nextSession, nextRoles);
      const nextPermissions = access.permissions || {};
      setProfiles((previous) => JSON.stringify(previous) === JSON.stringify(assigned) ? previous : assigned);
      setRoles((previous) => JSON.stringify(previous) === JSON.stringify(nextRoles) ? previous : nextRoles);
      setPermissions((previous) => JSON.stringify(previous) === JSON.stringify(nextPermissions) ? previous : nextPermissions);
      setOrganizationId(access.organization_id || null);
      setAccessError('');
    } catch {
      if (requestId === accessRequestRef.current) {
        syncManualAccessCookie(null, []);
        setAccessError('No pudimos comprobar tus permisos. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (requestId === accessRequestRef.current) setLoading(false);
    }
  }, []);

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
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshAccess(); }, 60_000);
    return () => {
      alive = false; listener.subscription.unsubscribe(); window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible); window.clearInterval(interval);
    };
  }, [refreshAccess]);

  const value = useMemo(() => ({
    session, user: session?.user || null, roles, profiles, permissions, organizationId, loading, accessError, refreshAccess,
    hasPermission: (module: string, action: string) => roles.includes('owner') || permissions?.[module]?.[action] === true || (action === 'view' && permissions?.[module]?.edit === true),
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
  }), [session, roles, profiles, permissions, organizationId, loading, accessError, refreshAccess]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}

