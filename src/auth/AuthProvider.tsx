import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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

  const refreshAccess = useCallback(async (currentSession = session) => {
    if (!supabase) { setLoading(false); return; }
    setSession(currentSession);
    if (!currentSession?.user) {
      setRoles([]); setProfiles([]); setPermissions({}); setOrganizationId(null); setLoading(false); return;
    }
    if (session?.user?.id !== currentSession.user.id) setLoading(true);
    const { data, error } = await supabase.rpc('get_my_visualcorp_access');
    if (error) {
      setRoles([]); setProfiles([]); setPermissions({}); setOrganizationId(null);
    } else {
      const access = data || {};
      const assigned = Array.isArray(access.roles) ? access.roles : [];
      setProfiles(assigned);
      setRoles([...new Set<string>(assigned.map((profile: AccessProfile) => profile.role).filter(Boolean))]);
      setPermissions(access.permissions || {});
      setOrganizationId(access.organization_id || null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) void refreshAccess(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (alive) setTimeout(() => { if (alive) void refreshAccess(currentSession); }, 0);
    });
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshAccess(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshAccess(); }, 60_000);
    return () => {
      alive = false; listener.subscription.unsubscribe(); window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible); window.clearInterval(interval);
    };
  }, [refreshAccess]);

  const value = useMemo(() => ({
    session, user: session?.user || null, roles, profiles, permissions, organizationId, loading, refreshAccess,
    hasPermission: (module: string, action: string) => roles.includes('owner') || permissions?.[module]?.[action] === true || (action === 'view' && permissions?.[module]?.edit === true),
    canAccess: (allowed: string[]) => roles.includes('owner') || allowed.some((role) => roles.includes(role)),
    sendSignInLink: async (email: string) => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
    },
    signInWithGoogle: async () => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${window.location.pathname}` } });
      if (error) throw error;
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  }), [session, roles, profiles, permissions, organizationId, loading, refreshAccess]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
