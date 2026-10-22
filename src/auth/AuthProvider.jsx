import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [roles, setRoles] = useState([]);
  const [organizationId, setOrganizationId] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let alive = true;
    const loadRoles = async (currentSession) => {
      setSession(currentSession);
      if (!currentSession?.user) { setRoles([]); setOrganizationId(null); setLoading(false); return; }
      setLoading(true);
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'visual-corp').maybeSingle();
      if (!alive) return;
      setOrganizationId(org?.id || null);
      if (!org?.id) { setRoles([]); setLoading(false); return; }
      const { data: memberships } = await supabase.from('organization_memberships').select('role').eq('organization_id', org.id).eq('user_id', currentSession.user.id).eq('active', true);
      if (!alive) return;
      setRoles((memberships || []).map((membership) => membership.role));
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => loadRoles(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => { void loadRoles(currentSession); });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    session, user: session?.user || null, roles, organizationId, loading,
    canAccess: (allowed) => roles.includes('owner') || allowed.some((role) => roles.includes(role)),
    sendSignInLink: async (email) => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
    },
    signInWithGoogle: async () => {
      if (!supabase) throw new Error('La conexión con Supabase todavía no está configurada.');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
      });
      if (error) throw error;
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
  }), [session, roles, organizationId, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
