import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialData, themePresets } from './data';
import { assetPath } from './data/media';
import { imageFor } from './catalog';
import { hasSupabase, supabase } from './lib/supabase';
import { fetchSiteData, persistSiteData, submitInquiry, submitQuoteRequest } from './lib/siteRepository';

const DATA_KEY = 'gigaprint-site-v1';
const CART_KEY = 'gigaprint-cart-v1';
const SiteContext = createContext(null);
const AuthContext = createContext(null);
const privilegedRoles = new Set(['admin', 'super_admin']);

async function fetchAuthProfile(user) {
  if (!user?.id || !supabase) return { profile: null, error: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', user.id)
    .maybeSingle();
  return {
    profile: data ? { ...data, email: user.email || '', full_name: data.display_name || '' } : null,
    error
  };
}

const uid = () => globalThis.crypto?.randomUUID?.() || `gigaprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

export const normalizeAssets = (value, key = '') => {
  if (Array.isArray(value)) return value.map((item) => normalizeAssets(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, normalizeAssets(entryValue, entryKey)])
    );
  }
  if (typeof value === 'string') {
    if (
      key === 'src' ||
      key === 'poster' ||
      key === 'image' ||
      key === 'url' ||
      key === 'logo' ||
      key === 'icon' ||
      /^\/?(?:media|images|brand)\//i.test(value)
    ) {
      return assetPath(value);
    }
  }
  return value;
};

function loadSiteData() {
  const stored = load(DATA_KEY, null);
  if (!stored) return normalizeAssets(initialData);
  const catalogIsCurrent = Number(stored.catalogVersion || 0) >= Number(initialData.catalogVersion || 1);
  const isSchemaCurrent = Number(stored.schemaVersion || 0) >= Number(initialData.schemaVersion || 1);

  // If stored address has legacy obsolete value, update to latest official location
  const storedAddress = stored.settings?.address || '';
  const needsAddressUpdate = !isSchemaCurrent || !storedAddress || storedAddress.includes('Quito');
  const resolvedAddress = needsAddressUpdate ? initialData.settings.address : storedAddress;

  const rawProducts = catalogIsCurrent && stored.products?.length ? stored.products : initialData.products;
  const enrichedProducts = rawProducts.map((p) => {
    const customImage = imageFor(p.category, p.name);
    return { ...p, image: customImage || p.image };
  });

  const next = {
    ...initialData,
    ...stored,
    schemaVersion: initialData.schemaVersion,
    settings: {
      ...initialData.settings,
      ...(stored.settings || {}),
      address: resolvedAddress,
      businessSchedule: stored.settings?.businessSchedule || initialData.settings.businessSchedule,
    },
    services: stored.services?.length ? stored.services : initialData.services,
    products: enrichedProducts,
    catalogVersion: initialData.catalogVersion,
    promotions: stored.promotions?.length ? stored.promotions : initialData.promotions,
    inquiries: stored.inquiries || [],
    homeBlocks: stored.homeBlocks?.length ? stored.homeBlocks : initialData.homeBlocks,
    calculatorSettings: { ...initialData.calculatorSettings, ...(stored.calculatorSettings || {}) },
  };
  return normalizeAssets(next);
}

export function SiteProvider({ children }) {
  const [data, setData] = useState(loadSiteData);
  const [cart, setCart] = useState(() => load(CART_KEY, []));
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('gigaprint-theme') || 'light');
  const [remoteReady, setRemoteReady] = useState(!hasSupabase);
  const siteTheme = data.settings?.themePreset || 'default';

  useEffect(() => localStorage.setItem(DATA_KEY, JSON.stringify(data)), [data]);
  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('gigaprint-theme', theme); }, [theme]);
  useEffect(() => {
    const preset = themePresets.find((item) => item.id === siteTheme) || themePresets[0];
    document.documentElement.dataset.siteTheme = preset.id;
    document.documentElement.style.setProperty('--brand-orange', '#ea580c');
    document.documentElement.style.setProperty('--orange', preset.palette.accent);
    document.documentElement.style.setProperty('--orange-dark', preset.palette.accentDark);
    document.documentElement.style.setProperty('--orange-soft', preset.palette.accentSoft);
    document.documentElement.style.setProperty('--theme-secondary', preset.palette.secondary);
  }, [siteTheme]);

  useEffect(() => {
    if (!hasSupabase) return undefined;
    let active = true;
    fetchSiteData()
      .then((remote) => {
        if (!active) return;
        if (remote) {
          const normalized = normalizeAssets(remote);
          setData((current) => {
            const rawRemoteSettings = normalized.settings || {};
            const isLegacyAddress = !rawRemoteSettings.address || rawRemoteSettings.address.includes('Quito');
            const mergedSettings = {
              ...current.settings,
              ...rawRemoteSettings,
              address: isLegacyAddress ? initialData.settings.address : rawRemoteSettings.address,
              phone: rawRemoteSettings.phone && !rawRemoteSettings.phone.includes('99 999 9999') ? rawRemoteSettings.phone : initialData.settings.phone,
              whatsapp: rawRemoteSettings.whatsapp && rawRemoteSettings.whatsapp !== '593999999999' ? rawRemoteSettings.whatsapp : initialData.settings.whatsapp,
            };

            const remoteProducts = normalized.products?.length ? normalized.products : current.products;
            const enrichedRemoteProducts = remoteProducts.map((p) => {
              if (p.source === 'esteban' || !p.image || p.image.includes('stickers.png') || p.image.includes('tazita.webp')) {
                return { ...p, image: imageFor(p.category, p.name) };
              }
              return p;
            });

            return {
              ...current,
              ...normalized,
              settings: mergedSettings,
              products: enrichedRemoteProducts
            };
          });
        }
        setRemoteReady(true);
      })
      .catch(() => setRemoteReady(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hasSupabase || !remoteReady) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled || !userData.user) return;
      const { profile } = await fetchAuthProfile(userData.user);
      if (cancelled || !privilegedRoles.has(profile?.role)) return;
      try { await persistSiteData(data); } catch { /* local state remains the safe fallback */ }
    }, 850);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data, remoteReady]);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const addToCart = (item) => {
    setCart((current) => {
      const fingerprint = item.configFingerprint || `${item.id}:${item.variant || 'default'}`;
      const match = current.find((row) => (row.configFingerprint || `${row.id}:${row.variant || 'default'}`) === fingerprint);
      if (match) {
        return current.map((row) => row === match ? { ...row, quantity: row.quantity + (item.quantity || 1) } : row);
      }
      return [...current, {
        ...item,
        cartId: item.cartId || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        configFingerprint: fingerprint,
        quantity: item.quantity || 1
      }];
    });
    notify('Agregado a tu carrito de cotizaciones');
  };
  const updateCartItem = (id, quantity) => setCart((current) => quantity <= 0 ? current.filter((item) => item.cartId !== id) : current.map((item) => item.cartId === id ? { ...item, quantity } : item));
  const removeCartItem = (id) => setCart((current) => current.filter((item) => item.cartId !== id));
  const saveInquiry = async (inquiry) => {
    const localInquiry = { ...inquiry, id: uid(), createdAt: new Date().toISOString(), status: 'nuevo' };
    setData((current) => ({ ...current, inquiries: [...current.inquiries, localInquiry] }));
    if (hasSupabase) {
      try { await submitInquiry(inquiry); } catch { /* the local copy keeps the form usable during a network interruption */ }
    }
    notify('Solicitud recibida. Te contactaremos pronto.');
  };
  const saveQuoteRequest = async (quote) => {
    try { return await submitQuoteRequest(quote); } catch { return null; }
  };
  const updateCollectionItem = (collection, id, patch) => setData((current) => ({ ...current, [collection]: current[collection].map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const addCollectionItem = (collection, item) => setData((current) => ({ ...current, [collection]: [...current[collection], item] }));
  const removeCollectionItem = (collection, id) => setData((current) => ({ ...current, [collection]: current[collection].filter((item) => item.id !== id) }));
  const resetData = () => setData(initialData);
  const setSiteTheme = (presetId) => {
    const next = themePresets.some((item) => item.id === presetId) ? presetId : 'default';
    setData((current) => ({ ...current, settings: { ...current.settings, themePreset: next } }));
    notify(next === 'default' ? 'Tema base de Gigaprint restaurado' : `Tema ${themePresets.find((item) => item.id === next)?.name || 'de temporada'} aplicado`);
  };

  const value = useMemo(() => ({ data, setData, cart, addToCart, updateCartItem, removeCartItem, saveInquiry, saveQuoteRequest, updateCollectionItem, addCollectionItem, removeCollectionItem, resetData, toast, notify, theme, setTheme, siteTheme, setSiteTheme }), [data, cart, toast, theme, siteTheme]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() { return useContext(SiteContext); }

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !hasSupabase && localStorage.getItem('gigaprint-admin') === 'true';
  });
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(() => {
    if (!hasSupabase && typeof window !== 'undefined' && localStorage.getItem('gigaprint-admin') === 'true') {
      return false;
    }
    return Boolean(hasSupabase);
  });

  useEffect(() => {
    if (!hasSupabase) {
      setAuthLoading(false);
      return;
    }

    let active = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) {
          if (active) {
            setIsAdmin(false);
            setUser(null);
            setUserProfile(null);
            setAuthLoading(false);
          }
          return;
        }

        if (active) setUser(session.user);

        const { profile, error: profileError } = await fetchAuthProfile(session.user);

        if (active) {
          setUserProfile(profile);
          const hasPrivilegedRole = privilegedRoles.has(profile?.role);
          const effectiveAdmin = hasPrivilegedRole;

          setIsAdmin(effectiveAdmin);
          if (effectiveAdmin) {
            localStorage.setItem('gigaprint-admin', 'true');
            if (session.user.email) {
              localStorage.setItem('gigaprint-admin-email', session.user.email);
            }
          }
          setAuthLoading(false);
          if (profileError) console.warn('[Gigaprint Auth] No se pudo leer el perfil:', profileError.message);
        }
      } catch {
        if (active) {
          setIsAdmin(false);
          setAuthLoading(false);
        }
      }
    };

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (!session?.user) {
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('gigaprint-admin');
          localStorage.removeItem('gigaprint-admin-email');
          setIsAdmin(false);
          setUser(null);
          setUserProfile(null);
        } else {
          setIsAdmin(false);
          setUser(null);
          setUserProfile(null);
        }
        return;
      }

      setUser(session.user);
      const { profile, error: profileError } = await fetchAuthProfile(session.user);

      if (!active) return;
      if (profileError) {
        console.warn('[Gigaprint Auth] No se pudo leer el perfil:', profileError.message);
        setAuthLoading(false);
        return;
      }
      setUserProfile(profile);
      const hasPrivilegedRole = privilegedRoles.has(profile?.role);
      const effectiveAdmin = hasPrivilegedRole;

      setIsAdmin(effectiveAdmin);
      if (effectiveAdmin) {
        localStorage.setItem('gigaprint-admin', 'true');
        if (session.user.email) {
          localStorage.setItem('gigaprint-admin-email', session.user.email);
        }
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (credentials) => {
    const password = typeof credentials === 'string' ? credentials : credentials.password;
    if (!hasSupabase && password === 'gigaprint') {
      localStorage.setItem('gigaprint-admin', 'true');
      setIsAdmin(true);
      setAuthLoading(false);
      return { ok: true };
    }

    if (!hasSupabase) {
      return { ok: false, error: 'Contraseña incorrecta.' };
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    });

    if (error) {
      return { ok: false, error: 'Correo o contraseña incorrectos.' };
    }

    const userObj = authData.user;
    setUser(userObj);

    const { profile, error: profileError } = await fetchAuthProfile(userObj);

    if (profileError) {
      await supabase.auth.signOut();
      setIsAdmin(false);
      return { ok: false, error: `No se pudo comprobar tu rol: ${profileError.message}` };
    }

    setUserProfile(profile);

    if (!privilegedRoles.has(profile?.role)) {
      await supabase.auth.signOut();
      localStorage.removeItem('gigaprint-admin');
      setIsAdmin(false);
      return { ok: false, error: 'Tu usuario aún no tiene rol de administrador.' };
    }

    localStorage.setItem('gigaprint-admin', 'true');
    if (credentials.email) {
      localStorage.setItem('gigaprint-admin-email', credentials.email);
    }
    setIsAdmin(true);
    setAuthLoading(false);
    return { ok: true };
  };

  const logout = async () => {
    if (hasSupabase) {
      try { await supabase.auth.signOut(); } catch { /* local-first fallback */ }
    }
    localStorage.removeItem('gigaprint-admin');
    localStorage.removeItem('gigaprint-admin-email');
    localStorage.removeItem('gigaprint-pos-session-v1');
    setIsAdmin(false);
    setUser(null);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      isAdmin,
      user,
      userProfile,
      authLoading,
      login,
      logout,
      authMode: hasSupabase ? 'supabase' : 'demo'
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
