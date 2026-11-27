import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  Ban,
  Briefcase,
  Building2,
  Check,
  Clock,
  Copy,
  Filter,
  IdCard,
  KeyRound,
  Percent,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  UserRoundX,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './ui/Avatar';
import { useConfirm } from './ui/OperationalKit';
import { supabase } from '../lib/supabaseClient';
import { normalizePersonName } from '../lib/personName';
import {
  applyPermissionMatrixChange,
  assignableBaseRoles,
  canActorManageBaseRole,
  legacyRoleNames,
  permissionModules,
  specialPermissionActions,
  type BaseRoleKey,
  type PermissionKey,
} from '../auth/accessCatalog';
import './team-access.css';

const modules = permissionModules;
const specialActions = specialPermissionActions;
const roleNames = legacyRoleNames;

interface BranchOption {
  id: string;
  code: string;
  name: string;
  active?: boolean;
}

interface RolePreset {
  id: string;
  name: string;
  keySuggestion: string;
  baseRole: Exclude<BaseRoleKey, 'owner'>;
  badge: string;
  description: string;
  permissions: PermissionKey[];
}

const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'advisor_pos',
    name: 'Asesora Comercial y POS',
    keySuggestion: 'asesora_comercial_pos',
    baseRole: 'advisor',
    badge: 'Ventas · POS · Turno propio',
    description: 'Atiende clientes, emite cotizaciones, registra ventas en POS (descuento comercial máx. 40% justificado) y abre su propio turno de caja.',
    permissions: [
      'dashboard.view',
      'crm.view',
      'crm.edit',
      'sales.view',
      'sales.edit',
      'quotes.view',
      'quotes.edit',
      'cash.view',
      'cash.edit',
      'catalog_admin.view',
      'workshop.view',
      'inventory.view',
    ],
  },
  {
    id: 'cashier_collections',
    name: 'Cajero y Recaudación',
    keySuggestion: 'cajero_recaudacion',
    baseRole: 'advisor',
    badge: 'Cajero · Movimientos · Devoluciones',
    description: 'Rol operativo de caja: controla aperturas, movimientos de caja, cobros de saldos y liquidación de devoluciones sin gestión financiera global.',
    permissions: [
      'dashboard.view',
      'sales.view',
      'sales.edit',
      'cash.view',
      'cash.edit',
      'cash.manage_cash',
      'sales.settle_refund',
      'crm.view',
      'quotes.view',
      'finance.view',
    ],
  },
  {
    id: 'workshop_lead',
    name: 'Jefe de Taller y Producción',
    keySuggestion: 'jefe_taller_produccion',
    baseRole: 'production',
    badge: 'Taller · OT · Inventario',
    description: 'Coordina órdenes de trabajo, asigna responsables de producción, cambia etapas, cierra órdenes y registra consumo de materiales.',
    permissions: [
      'dashboard.view',
      'workshop.view',
      'workshop.edit',
      'inventory.view',
      'inventory.edit',
      'quotes.view',
      'sales.view',
    ],
  },
  {
    id: 'warehouse_purchasing',
    name: 'Bodega, Compras y Costos',
    keySuggestion: 'bodega_compras_costos',
    baseRole: 'warehouse',
    badge: 'Stock · Costos · Proveedores',
    description: 'Controla existencias físicas, ajustes de conteo, costos unitarios de inventario y órdenes de compra a proveedores.',
    permissions: [
      'dashboard.view',
      'inventory.view',
      'inventory.edit',
      'inventory_costs.view',
      'inventory_costs.edit',
      'inventory_costs.view_costs',
      'inventory_costs.edit_costs',
      'purchases.view',
      'purchases.edit',
      'purchases.approve_purchase',
      'purchases.receive_purchase',
      'catalog_admin.view',
    ],
  },
  {
    id: 'marketing_web',
    name: 'Marketing y Sitio Web',
    keySuggestion: 'marketing_contenido_web',
    baseRole: 'marketing',
    badge: 'Campañas · Web · Catálogo',
    description: 'Gestiona campañas publicitarias, publicaciones del sitio web, portafolio y fichas comerciales del catálogo.',
    permissions: [
      'dashboard.view',
      'marketing.view',
      'marketing.edit',
      'website.view',
      'website.edit',
      'website.publish_content',
      'catalog_admin.view',
      'catalog_admin.edit',
      'crm.view',
    ],
  },
  {
    id: 'hr_schedule_admin',
    name: 'Gestión de Personal y Horarios',
    keySuggestion: 'gestion_personal_horarios',
    baseRole: 'manager',
    badge: 'Personal · Horarios · Turnos',
    description: 'Gestiona fichas laborales, horarios y turnos, sin acceso a remuneraciones ni finanzas.',
    permissions: [
      'dashboard.view',
      'personnel.view',
      'personnel.edit',
      'team_schedule.view',
      'team_schedule.edit',
    ],
  },
  {
    id: 'hr_finance_admin',
    name: 'Supervisor: Administración, RR.HH. y Finanzas',
    keySuggestion: 'admin_rrhh_finanzas',
    baseRole: 'manager',
    badge: 'Supervisor · Finanzas · Nómina · Caja',
    description: 'Supervisa flujo financiero, movimientos de caja, fichas laborales, salarios base, descuentos de nómina, asistencia y tarifas.',
    permissions: [
      'dashboard.view',
      'dashboard.edit',
      'finance.view',
      'finance.edit',
      'finance.manage_finance',
      'personnel.view',
      'personnel.edit',
      'personnel.view_compensation',
      'personnel.edit_compensation',
      'team_schedule.view',
      'team_schedule.edit',
      'cash.view',
      'cash.edit',
      'cash.manage_cash',
      'sales.settle_refund',
      'sales.view',
      'sales.edit',
      'quotes.view',
      'quotes.edit',
      'crm.view',
      'crm.edit',
      'inventory.view',
      'inventory_costs.view',
      'inventory_costs.view_costs',
      'purchases.view',
      'purchases.edit',
      'purchases.approve_purchase',
      'catalog_admin.view',
      'catalog_admin.edit',
      'catalog_admin.edit_prices',
    ],
  },
];

function formatRelativeAccess(isoDate: string | null | undefined): string {
  if (!isoDate) return 'Sin ingreso registrado';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Sin ingreso registrado';
  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 5) return 'Activo hace instantes';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 30) return `Hace ${diffDays} día${diffDays === 1 ? '' : 's'}`;
  return parsed.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TeamAccess() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { organizationId, roles, branchScopes, hasPermission, refreshAccess } = useAuth();
  const confirm = useConfirm();

  const isOwner = useMemo(
    () =>
      roles.includes('owner') &&
      (branchScopes.length === 0 || branchScopes.some((scope) => scope.role === 'owner' && scope.branch_id === null)),
    [roles, branchScopes],
  );
  const canManageProfiles = hasPermission('team', 'manage_profiles', null);
  const canManageMembers = hasPermission('team', 'manage_members');
  const canManageOrgWideMembers = isOwner || hasPermission('team', 'manage_members', null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [personnelRecords, setPersonnelRecords] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitationLoadError, setInvitationLoadError] = useState(false);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [requestProfilesById, setRequestProfilesById] = useState<Record<string, string>>({});
  const [requestBranchesById, setRequestBranchesById] = useState<Record<string, string>>({});
  const [requestLoadingId, setRequestLoadingId] = useState<string | null>(null);
  const [requestsRefreshing, setRequestsRefreshing] = useState(false);
  const [lastInvitationEmail, setLastInvitationEmail] = useState('');
  const [copiedInvitationEmail, setCopiedInvitationEmail] = useState('');
  const requestsPanelRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(search).get('perfil') || '');
  const selectedIdRef = useRef('');
  selectedIdRef.current = selectedId;
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [profileBaseRole, setProfileBaseRole] = useState<string>('advisor');
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [assignBranchId, setAssignBranchId] = useState('');
  const [inlineAssignByEmail, setInlineAssignByEmail] = useState<Record<string, string>>({});
  const [inlineBranchByEmail, setInlineBranchByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountState, setAccountState] = useState<'all' | 'active' | 'blocked' | 'unassigned' | 'with_personnel' | 'without_personnel'>('all');
  const [profileFilterId, setProfileFilterId] = useState('all');
  const [branchFilterId, setBranchFilterId] = useState<'all' | 'global' | string>('all');
  const [matrixFilter, setMatrixFilter] = useState('');

  const load = useCallback(async (preferredId?: string) => {
    if (!organizationId || !supabase) {
      setLoadFailed(true);
      setError('No se pudo establecer la conexión con la organización.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    setError('');
    const [profileResult, permissionResult, memberResult, branchResult, googleResult, invitationResult, personnelResult, requestsResult] = await Promise.all([
      supabase.from('access_profiles').select('id,profile_key,name,description,base_role,is_system,active').eq('organization_id', organizationId).order('name'),
      supabase.from('access_profile_permissions').select('profile_id,module_key,action_key,enabled'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.from('branches').select('id,code,name,active').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.rpc('list_visualcorp_team_accounts_with_avatars'),
      supabase.rpc('list_organization_access_invitations', { p_organization_id: organizationId }),
      supabase.from('personnel_records').select('id,full_name,email,department,job_title,status').eq('organization_id', organizationId),
      Promise.resolve(supabase.rpc('list_organization_access_requests', { p_organization_id: organizationId })).catch(() => ({ data: [], error: true })),
    ]);
    const profileRows = profileResult.data || [];
    const membershipRows = memberResult.data || [];
    const firstError = profileResult.error || permissionResult.error || memberResult.error || googleResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setProfiles(profileRows);
    setPermissionRows(permissionResult.data || []);
    setBranches(branchResult.data || []);
    setMembers(
      membershipRows.map((member: any) => ({
        ...member,
        profiles: { full_name: member.full_name, email: member.email },
        access_profiles: { name: member.access_profile_name, profile_key: member.access_profile_key },
      })),
    );
    setGoogleAccounts(googleResult.data || []);
    setPersonnelRecords(personnelResult.data || []);
    setInvitations(invitationResult.data || []);
    setInvitationLoadError(Boolean(invitationResult.error));
    if (!requestsResult.error && Array.isArray(requestsResult.data)) {
      setAccessRequests(requestsResult.data);
    } else {
      setAccessRequests([]);
    }
    const loadedPermRows = permissionResult.data || [];
    const chosen = preferredId || selectedIdRef.current || profileResult.data?.find((profile: any) => profile.profile_key !== 'owner')?.id || '';
    setSelectedId(chosen);
    const selected = profileResult.data?.find((profile: any) => profile.id === chosen);
    if (selected) {
      setProfileName(selected.name);
      setProfileDescription(selected.description || '');
      setProfileKey(selected.profile_key);
      setProfileBaseRole(selected.base_role || 'advisor');
      setMatrix(
        Object.fromEntries(
          loadedPermRows.filter((row: any) => row.profile_id === chosen).map((row: any) => [`${row.module_key}.${row.action_key}`, row.enabled]),
        ),
      );
    }
    setLoading(false);
  }, [organizationId]);

  const reloadAccessRequests = useCallback(async (showSpinner = false) => {
    if (!organizationId || !supabase || !canManageOrgWideMembers) return;
    if (showSpinner) setRequestsRefreshing(true);
    try {
      const { data, error: reqError } = await supabase.rpc('list_organization_access_requests', { p_organization_id: organizationId });
      if (!reqError && Array.isArray(data)) {
        setAccessRequests(data);
      }
    } catch {
      /* RPC may not be deployed yet; degrade silently. */
    } finally {
      if (showSpinner) setRequestsRefreshing(false);
    }
  }, [organizationId, canManageOrgWideMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void reloadAccessRequests(false);
      }
    };
    const onFocus = () => void reloadAccessRequests(false);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [reloadAccessRequests]);

  const manageableBranches = useMemo(
    () => branches.filter((branch) => hasPermission('team', 'manage_members', branch.id)),
    [branches, hasPermission],
  );

  const defaultScopedBranchId = useMemo(
    () => (canManageOrgWideMembers ? '' : manageableBranches[0]?.id || ''),
    [canManageOrgWideMembers, manageableBranches],
  );

  const effectiveAssignBranchId = useMemo(() => {
    if (canManageOrgWideMembers) return assignBranchId;
    if (assignBranchId && manageableBranches.some((b) => b.id === assignBranchId)) return assignBranchId;
    return manageableBranches[0]?.id || '';
  }, [canManageOrgWideMembers, assignBranchId, manageableBranches]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId);
  const lastPathPart = pathname.split('/').filter(Boolean).at(-1) || '';
  const section: 'usuarios' | 'perfiles' | 'permisos' = ['usuarios', 'perfiles', 'permisos'].includes(lastPathPart)
    ? (lastPathPart as 'usuarios' | 'perfiles' | 'permisos')
    : 'usuarios';
  const sectionTitles = {
    usuarios: 'Usuarios y Accesos',
    perfiles: 'Perfiles y Roles',
    permisos: 'Permisos y Gobernanza',
  };
  const sectionDescriptions = {
    usuarios: 'Administra las cuentas del equipo, su alcance por sucursal, perfiles de acceso y políticas operativas activas.',
    perfiles: 'Organiza funciones del equipo mediante perfiles claros, roles base del sistema y plantillas por área operativa.',
    permisos: 'Configura la matriz de permisos por módulo y las reglas críticas de descuentos comerciales, precios, devoluciones y nómina.',
  };
  const profileQuery = selectedId && section !== 'usuarios' ? `?perfil=${encodeURIComponent(selectedId)}` : '';
  const teamPage = (page: 'usuarios' | 'perfiles' | 'permisos') => `/operaciones/equipo/${page}${page === 'usuarios' ? '' : profileQuery}`;

  const permissionsByProfileId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of permissionRows) {
      if (!row.enabled) continue;
      const set = map.get(row.profile_id) || new Set<string>();
      set.add(`${row.module_key}.${row.action_key}`);
      map.set(row.profile_id, set);
    }
    return map;
  }, [permissionRows]);

  const orgWideActorRoles = useMemo(() => {
    if (!branchScopes.length) return roles;
    return [...new Set(branchScopes.filter((s) => s.branch_id === null).map((s) => s.role).filter(Boolean))];
  }, [branchScopes, roles]);

  const actorRolesForBranch = useCallback(
    (targetBranchId: string | null): string[] => {
      if (!branchScopes.length) return roles;
      const matching = branchScopes.filter((scope) =>
        targetBranchId === null ? scope.branch_id === null : scope.branch_id === null || scope.branch_id === targetBranchId,
      );
      return [...new Set(matching.map((scope) => scope.role).filter(Boolean))];
    },
    [branchScopes, roles],
  );

  const canDelegateProfileForBranch = useCallback(
    (profile: any, targetBranchId: string | null): boolean => {
      if (!profile?.active || profile.profile_key === 'owner' || profile.base_role === 'owner') return false;
      if (isOwner) return true;
      if (
        profile.base_role === 'admin' ||
        profile.base_role === 'website_admin' ||
        ['admin', 'website_admin'].includes(profile.profile_key)
      ) {
        return false;
      }
      const scopedRoles = actorRolesForBranch(targetBranchId);
      if (!canActorManageBaseRole(scopedRoles, profile.base_role || '')) return false;
      const profilePerms = permissionsByProfileId.get(profile.id);
      if (!profilePerms) return true;
      for (const permKey of profilePerms) {
        const [mod, act] = permKey.split('.');
        if (!hasPermission(mod, act, targetBranchId)) return false;
      }
      return true;
    },
    [isOwner, actorRolesForBranch, permissionsByProfileId, hasPermission],
  );

  const canEditSelectedProfile = useMemo(() => {
    if (!canManageProfiles) return false;
    if (!selectedProfile) return true;
    if (selectedProfile.profile_key === 'owner' || selectedProfile.base_role === 'owner') return false;
    if (isOwner) return true;
    if (
      selectedProfile.base_role === 'admin' ||
      selectedProfile.base_role === 'website_admin' ||
      ['admin', 'website_admin'].includes(selectedProfile.profile_key)
    ) {
      return false;
    }
    return canActorManageBaseRole(orgWideActorRoles, selectedProfile.base_role || '');
  }, [canManageProfiles, selectedProfile, isOwner, orgWideActorRoles]);

  const canUsePreset = useCallback(
    (preset: RolePreset): boolean => {
      if (!canEditSelectedProfile) return false;
      if (isOwner) return true;
      if (!canActorManageBaseRole(orgWideActorRoles, preset.baseRole)) return false;
      return preset.permissions.every((permKey) => {
        const [mod, act] = permKey.split('.');
        return hasPermission(mod, act, null);
      });
    },
    [canEditSelectedProfile, isOwner, orgWideActorRoles, hasPermission],
  );

  const personnelLookup = useMemo(() => {
    const byId = new Map<string, any>();
    const byEmail = new Map<string, any>();
    for (const rec of personnelRecords) {
      byId.set(String(rec.id), rec);
      if (rec.email) {
        byEmail.set(String(rec.email).toLowerCase().trim(), rec);
      }
    }
    return { byId, byEmail };
  }, [personnelRecords]);

  const memberAccounts = useMemo(() => {
    const grouped = new Map<
      string,
      { user_id: string; full_name: string; email: string; last_sign_in_at: string | null; memberships: any[]; avatar_url?: string | null }
    >();
    for (const member of members) {
      const account = grouped.get(member.user_id) || {
        user_id: member.user_id,
        full_name: normalizePersonName(member.profiles?.full_name),
        email: member.profiles?.email || '',
        last_sign_in_at: member.last_sign_in_at,
        memberships: [],
      };
      account.memberships.push(member);
      grouped.set(member.user_id, account);
    }
    return [...grouped.values()].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'es'));
  }, [members]);

  const accountDirectory = useMemo(() => {
    const accounts = new Map(memberAccounts.map((account) => [account.user_id, { ...account, googleAccount: null as any }]));
    for (const googleAccount of googleAccounts) {
      const existing = accounts.get(googleAccount.user_id);
      accounts.set(
        googleAccount.user_id,
        existing
          ? { ...existing, googleAccount }
          : {
              user_id: googleAccount.user_id,
              full_name: normalizePersonName(googleAccount.full_name),
              email: googleAccount.email,
              last_sign_in_at: googleAccount.last_sign_in_at,
              memberships: [],
              googleAccount,
            },
      );
    }
    return [...accounts.values()]
      .map((account) => {
        const emailLower = String(account.email || '').toLowerCase().trim();
        const linkedPersonnel =
          (account.googleAccount?.linked_personnel_id
            ? personnelLookup.byId.get(String(account.googleAccount.linked_personnel_id))
            : null) ||
          personnelLookup.byEmail.get(emailLower) ||
          null;
        const effectivePerms = new Set<string>();
        const isOwnerAccount = account.memberships.some((m: any) => m.active && m.role === 'owner');
        for (const m of account.memberships) {
          if (!m.active) continue;
          const pSet = permissionsByProfileId.get(m.profile_id || m.access_profile_id);
          if (pSet) {
            pSet.forEach((perm) => effectivePerms.add(perm));
          }
        }
        return {
          ...account,
          linkedPersonnel,
          isOwner: isOwnerAccount,
          effectivePerms,
        };
      })
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'es'));
  }, [memberAccounts, googleAccounts, personnelLookup, permissionsByProfileId]);

  const activeMembers = useMemo(
    () => accountDirectory.filter((account) => account.memberships.some((membership: any) => membership.active)).length,
    [accountDirectory],
  );
  const linkedPersonnelAccountsCount = useMemo(
    () => accountDirectory.filter((account) => Boolean(account.linkedPersonnel || account.googleAccount?.linked_personnel_name)).length,
    [accountDirectory],
  );

  const memberCountByProfileId = useMemo(() => {
    const counts = new Map<string, { total: number; active: number }>();
    for (const member of members) {
      const pid = member.profile_id || member.access_profile_id;
      if (!pid) continue;
      const prev = counts.get(pid) || { total: 0, active: 0 };
      prev.total += 1;
      if (member.active) prev.active += 1;
      counts.set(pid, prev);
    }
    return counts;
  }, [members]);

  const filteredAccounts = useMemo(() => {
    const query = accountQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    return accountDirectory.filter((account) => {
      const active = account.memberships.some((membership: any) => membership.active);
      const hasPersonnel = Boolean(account.linkedPersonnel || account.googleAccount?.linked_personnel_name);
      if (accountState === 'active' && !active) return false;
      if (accountState === 'blocked' && (active || !account.memberships.length)) return false;
      if (accountState === 'unassigned' && account.memberships.length > 0) return false;
      if (accountState === 'with_personnel' && !hasPersonnel) return false;
      if (accountState === 'without_personnel' && hasPersonnel) return false;
      if (profileFilterId !== 'all' && !account.memberships.some((m: any) => (m.profile_id || m.access_profile_id) === profileFilterId)) {
        return false;
      }
      if (branchFilterId === 'global' && !account.memberships.some((m: any) => !m.branch_id)) {
        return false;
      }
      if (branchFilterId !== 'all' && branchFilterId !== 'global' && !account.memberships.some((m: any) => m.branch_id === branchFilterId)) {
        return false;
      }
      const haystack = `${account.full_name} ${account.email} ${account.linkedPersonnel?.full_name || ''} ${account.linkedPersonnel?.job_title || ''} ${account.linkedPersonnel?.department || ''} ${account.memberships
        .map((membership: any) => `${membership.access_profiles?.name || roleNames[membership.role] || membership.role} ${membership.branch_name || 'Todas las sucursales'} ${membership.branch_code || ''}`)
        .join(' ')}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');
      return !query || haystack.includes(query);
    });
  }, [accountDirectory, accountQuery, accountState, profileFilterId, branchFilterId]);

  const selectProfile = (id: string) => {
    setSelectedId(id);
    navigate({ pathname, search: id ? `?perfil=${encodeURIComponent(id)}` : '' }, { replace: true });
    setMessage('');
    setError('');
    const selected = profiles.find((profile) => profile.id === id);
    if (!selected) {
      setProfileName('');
      setProfileDescription('');
      setProfileKey('nuevo_perfil');
      setProfileBaseRole('advisor');
      setMatrix({});
      return;
    }
    setProfileName(selected.name);
    setProfileDescription(selected.description || '');
    setProfileKey(selected.profile_key);
    setProfileBaseRole(selected.base_role || 'advisor');
    setMatrix(
      Object.fromEntries(
        permissionRows.filter((row) => row.profile_id === id).map((row) => [`${row.module_key}.${row.action_key}`, row.enabled]),
      ),
    );
  };

  const setPermission = (key: string, enabled: boolean) => {
    if (!canEditSelectedProfile) return;
    setMatrix((current) => applyPermissionMatrixChange(current, key, enabled));
  };

  const applyRolePreset = (preset: RolePreset) => {
    if (!canUsePreset(preset)) return;
    const nextMatrix: Record<string, boolean> = {};
    for (const permKey of preset.permissions) {
      nextMatrix[permKey] = true;
    }
    setMatrix(nextMatrix);
    if (!selectedProfile?.is_system) {
      setProfileBaseRole(preset.baseRole);
    }
    if (!selectedId) {
      setProfileName(preset.name);
      setProfileKey(preset.keySuggestion);
      setProfileDescription(preset.description);
    } else if (!profileDescription.trim()) {
      setProfileDescription(preset.description);
    }
    setMessage(`Plantilla "${preset.name}" aplicada en la matriz (${roleNames[preset.baseRole] || preset.baseRole}). Guarda el perfil para confirmar los cambios.`);
    setError('');
  };

  const applyBulkMatrixAction = (mode: 'all_view' | 'all_edit' | 'clear_all') => {
    if (!canEditSelectedProfile) return;
    if (mode === 'clear_all') {
      setMatrix({});
      return;
    }
    setMatrix((current) => {
      const next = { ...current };
      for (const [moduleKey] of modules) {
        if (isOwner || hasPermission(moduleKey, 'view', null)) {
          next[`${moduleKey}.view`] = true;
        }
        if (mode === 'all_edit' && (isOwner || hasPermission(moduleKey, 'edit', null))) {
          next[`${moduleKey}.edit`] = true;
        }
      }
      return next;
    });
  };

  const toggleModuleRowAll = (moduleKey: string, enable: boolean) => {
    if (!canEditSelectedProfile) return;
    setMatrix((current) => {
      let next = applyPermissionMatrixChange(current, `${moduleKey}.view`, enable);
      next = applyPermissionMatrixChange(next, `${moduleKey}.edit`, enable && (isOwner || hasPermission(moduleKey, 'edit', null)));
      if (!enable) {
        next = applyPermissionMatrixChange(next, `${moduleKey}.delete_records`, false);
      }
      return next;
    });
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEditSelectedProfile || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    const entries: Array<{ module_key: string; action_key: string; enabled: boolean }> = [
      ...modules.flatMap(([module]) => [
        { module_key: module, action_key: 'view', enabled: Boolean(matrix[`${module}.view`]) },
        { module_key: module, action_key: 'edit', enabled: Boolean(matrix[`${module}.edit`]) },
      ]),
      ...specialActions.map(({ module, action }) => ({
        module_key: module,
        action_key: action,
        enabled: Boolean(matrix[`${module}.${action}`]),
      })),
      ...modules.map(([module]) => ({
        module_key: module,
        action_key: 'delete_records',
        enabled: module === 'personnel' ? false : Boolean(matrix[`${module}.delete_records`]),
      })),
    ];
    try {
      const { data, error: saveError } = await supabase.rpc('save_visualcorp_access_profile', {
        p_profile_id: selectedId || null,
        p_key: profileKey,
        p_name: profileName,
        p_description: profileDescription,
        p_permissions: entries,
        p_base_role: selectedProfile?.is_system ? selectedProfile.base_role : profileBaseRole,
      });
      if (saveError) throw saveError;
      setSelectedId(data);
      await load(data);
      setMessage('Perfil guardado. Los permisos y el rol base se aplican desde la base de datos.');
      await refreshAccess();
    } catch (saveError: any) {
      setError(saveError.message || 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const createProfile = () => {
    setSelectedId('');
    setProfileName('');
    setProfileDescription('');
    setProfileKey('nuevo_perfil');
    setProfileBaseRole('advisor');
    setMatrix({});
    setMessage('');
    setError('');
    navigate({ pathname, search: '' }, { replace: true });
  };

  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageMembers || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    const branchIdArg = effectiveAssignBranchId || null;
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', {
        p_organization_id: organizationId,
        p_email: email.trim(),
        p_profile_id: assignProfileId,
        p_branch_id: branchIdArg,
      });
      if (assignError) throw assignError;
      const invitedTargetEmail = data?.email || email.trim();
      setEmail('');
      await load();
      const targetBranchName = branchIdArg ? branches.find((b) => b.id === branchIdArg)?.name || 'la sucursal seleccionada' : 'todas las sucursales';
      if (data?.status === 'assigned') {
        setLastInvitationEmail('');
        setMessage(`Acceso asignado a ${data.email} (${targetBranchName}). Los permisos se actualizarán en su sesión.`);
      } else {
        setLastInvitationEmail(invitedTargetEmail);
        setMessage(
          `Invitación creada para ${invitedTargetEmail} (${targetBranchName}). Vence el ${
            data?.expires_at ? new Date(data.expires_at).toLocaleDateString('es-EC') : 'en 7 días'
          }. Comunica el acceso por un canal verificado; la aplicación no envía correos.`,
        );
      }
    } catch (assignError: any) {
      setError(assignError.message || 'No se pudo asignar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const assignInlineProfileToAccount = async (accountEmail: string, profileIdToAssign: string, branchIdToAssign: string | null) => {
    if (!canManageMembers || saving || !accountEmail || !profileIdToAssign) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', {
        p_organization_id: organizationId,
        p_email: accountEmail.trim(),
        p_profile_id: profileIdToAssign,
        p_branch_id: branchIdToAssign,
      });
      if (assignError) throw assignError;
      setInlineAssignByEmail((prev) => ({ ...prev, [accountEmail]: '' }));
      await load();
      const assignedProfileName = profiles.find((p) => p.id === profileIdToAssign)?.name || 'perfil seleccionado';
      const branchLabel = branchIdToAssign ? branches.find((b) => b.id === branchIdToAssign)?.name || 'sucursal' : 'todas las sucursales';
      setMessage(
        data?.status === 'assigned'
          ? `Perfil "${assignedProfileName}" asignado a ${accountEmail} (${branchLabel}).`
          : `Invitación de perfil "${assignedProfileName}" registrada para ${accountEmail} (${branchLabel}).`,
      );
      await refreshAccess();
    } catch (assignError: any) {
      setError(assignError.message || 'No se pudo asignar el perfil a la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const changeMembershipBranch = async (member: any, nextBranchId: string) => {
    if (!canManageOrgWideMembers || saving || member.role === 'owner') return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { error: branchError } = await supabase.rpc('assign_visualcorp_membership_branch', {
        p_organization_id: organizationId,
        p_membership_id: member.id,
        p_branch_id: nextBranchId || null,
      });
      if (branchError) throw branchError;
      await load();
      const label = nextBranchId ? branches.find((b) => b.id === nextBranchId)?.name || 'Sucursal asignada' : 'Todas las sucursales';
      setMessage(`Alcance actualizado a "${label}".`);
      await refreshAccess();
    } catch (branchError: any) {
      setError(branchError.message || 'No se pudo actualizar la sucursal de la membresía.');
    } finally {
      setSaving(false);
    }
  };

  const revokeInvitation = async (invitation: any) => {
    if (!canManageMembers || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { error: revokeError } = await supabase.rpc('revoke_organization_access_invitation', { p_invitation_id: invitation.id });
      if (revokeError) throw revokeError;
      await load();
      setMessage(`Invitación cancelada para ${invitation.invited_email}.`);
    } catch (revokeError: any) {
      setError(revokeError.message || 'No se pudo cancelar la invitación.');
    } finally {
      setSaving(false);
    }
  };

  const approveAccessRequest = async (req: any) => {
    const reqBranchId = canManageOrgWideMembers
      ? requestBranchesById[req.id] || ''
      : requestBranchesById[req.id] && manageableBranches.some((b) => b.id === requestBranchesById[req.id])
      ? requestBranchesById[req.id]
      : defaultScopedBranchId;
    const branchArg = reqBranchId || null;
    const eligibleProfiles = profiles.filter((p) => canDelegateProfileForBranch(p, branchArg));
    const profileId = requestProfilesById[req.id] && eligibleProfiles.some((p) => p.id === requestProfilesById[req.id])
      ? requestProfilesById[req.id]
      : eligibleProfiles[0]?.id || '';
    if (!canManageMembers || requestLoadingId || !profileId) return;
    setRequestLoadingId(req.id);
    setMessage('');
    setError('');
    try {
      const { data, error: approveError } = await supabase.rpc('approve_organization_access_request', {
        p_request_id: req.id,
        p_profile_id: profileId,
        p_branch_id: branchArg,
      });
      if (approveError) throw approveError;
      await load();
      const profName = data?.profile_name || profiles.find((p) => p.id === profileId)?.name || 'perfil asignado';
      const branchText = branchArg ? branches.find((b) => b.id === branchArg)?.name || 'sucursal' : 'todas las sucursales';
      setMessage(`Acceso aprobado para ${data?.email || req.email} con el perfil "${profName}" (${branchText}).`);
    } catch (approveError: any) {
      setError(approveError.message || 'No se pudo aprobar la solicitud de acceso.');
    } finally {
      setRequestLoadingId(null);
    }
  };

  const dismissAccessRequest = async (req: any) => {
    if (!canManageOrgWideMembers || requestLoadingId) return;
    setRequestLoadingId(req.id);
    setMessage('');
    setError('');
    try {
      const { error: dismissError } = await supabase.rpc('dismiss_organization_access_request', {
        p_request_id: req.id,
      });
      if (dismissError) throw dismissError;
      await load();
      setMessage(`Solicitud descartada para ${req.email || req.full_name || 'la cuenta'}.`);
    } catch (dismissError: any) {
      setError(dismissError.message || 'No se pudo descartar la solicitud de acceso.');
    } finally {
      setRequestLoadingId(null);
    }
  };

  const copyInvitationMessage = async (targetEmail: string) => {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://visualcorp-suite.vercel.app';
    const text = `Ingresa a ${origin} con Google usando ${targetEmail}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInvitationEmail(targetEmail);
      setMessage(`Mensaje de invitación copiado para ${targetEmail}.`);
      window.setTimeout(() => setCopiedInvitationEmail((prev) => (prev === targetEmail ? '' : prev)), 3000);
    } catch {
      setMessage(text);
    }
  };

  const setMemberActive = async (member: any) => {
    if (!canManageMembers || member.role === 'owner' || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { error: stateError } = await supabase.rpc('set_visualcorp_membership_active', {
        p_membership_id: member.id,
        p_active: !member.active,
      });
      if (stateError) throw stateError;
      await load();
      setMessage(member.active ? 'Acceso pausado.' : 'Acceso reactivado.');
    } catch (stateError: any) {
      setError(stateError.message || 'No se pudo actualizar el acceso.');
    } finally {
      setSaving(false);
    }
  };

  const setAccountAccessActive = async (account: any, active: boolean) => {
    if (!canManageOrgWideMembers || saving || account.memberships.some((membership: any) => membership.role === 'owner')) return;
    if (
      !active &&
      !(await confirm({
        eyebrow: 'SEGURIDAD DE ACCESO',
        title: `¿Bloquear a ${account.full_name || account.email} en Visual Corp?`,
        description: 'Se pausarán todos sus perfiles de acceso activos en el espacio.',
        tone: 'warning',
        confirmLabel: 'Bloquear acceso',
        cancelLabel: 'Cancelar',
        summaryItems: [
          { label: 'Usuario', value: account.full_name || account.email },
          { label: 'Correo', value: account.email || '—' },
        ],
        consequences: [
          'Su cuenta Google y su historial operativo se conservarán íntegros.',
          'Un administrador podrá reactivar el acceso cuando sea necesario.',
        ],
      }))
    )
      return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data, error: stateError } = await supabase.rpc('set_visualcorp_user_access_active', {
        p_user_id: account.user_id,
        p_active: active,
      });
      if (stateError) throw stateError;
      await load();
      setMessage(
        data
          ? active
            ? `Acceso reactivado en ${data} perfil${data === 1 ? '' : 'es'}.`
            : `Acceso bloqueado en ${data} perfil${data === 1 ? '' : 'es'}.`
          : 'La cuenta ya estaba en ese estado.',
      );
      await refreshAccess();
    } catch (stateError: any) {
      setError(stateError.message || 'No se pudo actualizar el acceso de la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const removeAccountAccess = async (account: any) => {
    if (!canManageOrgWideMembers || saving || !account.memberships.length || account.memberships.some((membership: any) => membership.role === 'owner'))
      return;
    if (
      !(await confirm({
        eyebrow: 'ADMINISTRACIÓN DE EQUIPO',
        title: `¿Quitar a ${account.full_name || account.email} de Visual Corp?`,
        description: 'Se eliminarán sus perfiles asignados y perderá el acceso al espacio.',
        tone: 'danger',
        destructive: true,
        confirmLabel: 'Retirar del equipo',
        cancelLabel: 'Conservar cuenta',
        summaryItems: [
          { label: 'Colaborador', value: account.full_name || account.email },
          { label: 'Perfiles asignados', value: `${account.memberships.length} perfil(es)` },
        ],
        consequences: [
          'La cuenta Google seguirá existiendo sin cambios.',
          'El historial de ventas, producción y caja se conservará.',
          'Más adelante podrás volver a asignarle un perfil.',
        ],
      }))
    )
      return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data, error: removeError } = await supabase.rpc('remove_visualcorp_user_access', { p_user_id: account.user_id });
      if (removeError) throw removeError;
      await load();
      setMessage(`Cuenta retirada de Visual Corp. Se conservaron sus registros históricos; se quitaron ${data} perfil${data === 1 ? '' : 'es'}.`);
      await refreshAccess();
    } catch (removeError: any) {
      setError(removeError.message || 'No se pudo retirar la cuenta del equipo.');
    } finally {
      setSaving(false);
    }
  };

  const setProfileActive = async () => {
    if (!selectedProfile || !canEditSelectedProfile || saving || selectedProfile.profile_key === 'owner') return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { error: stateError } = await supabase.rpc('set_visualcorp_profile_active', {
        p_profile_id: selectedProfile.id,
        p_active: !selectedProfile.active,
      });
      if (stateError) throw stateError;
      await load();
      setMessage(
        selectedProfile.active
          ? 'Perfil desactivado. Las cuentas asignadas conservaron su registro y ya no pueden usarlo.'
          : 'Perfil reactivado.',
      );
      await refreshAccess();
    } catch (stateError: any) {
      setError(stateError.message || 'No se pudo actualizar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const visibleProfiles = profiles.filter((profile) => profile.profile_key !== 'owner');
  const assignableProfilesForInvite = useMemo(
    () => profiles.filter((profile) => canDelegateProfileForBranch(profile, effectiveAssignBranchId || null)),
    [profiles, canDelegateProfileForBranch, effectiveAssignBranchId],
  );
  const assignedAccounts = accountDirectory.filter((account) => account.memberships.length > 0).length;

  const filteredModules = useMemo(() => {
    const q = matrixFilter.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    if (!q) return modules;
    return modules.filter(([key, label]) =>
      `${key} ${label}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes(q),
    );
  }, [matrixFilter]);

  const activeMatrixSummary = useMemo(() => {
    let viewCount = 0;
    let editCount = 0;
    let deleteCount = 0;
    let specialCount = 0;
    for (const [key] of modules) {
      if (matrix[`${key}.view`]) viewCount += 1;
      if (matrix[`${key}.edit`]) editCount += 1;
      if (matrix[`${key}.delete_records`]) deleteCount += 1;
    }
    for (const { module, action } of specialActions) {
      if (matrix[`${module}.${action}`]) specialCount += 1;
    }
    return { viewCount, editCount, deleteCount, specialCount };
  }, [matrix]);

  if (pathname.startsWith('/operaciones/equipo/') && !['usuarios', 'perfiles', 'permisos'].includes(lastPathPart)) {
    return <Navigate to="/operaciones/equipo/usuarios" replace />;
  }

  return (
    <div className={`team-access team-access-section-${section}`}>
      <header className="team-page-heading">
        <div>
          <div className="eyebrow">ADMINISTRACIÓN · EQUIPO, ROLES Y GOBERNANZA</div>
          <h1>{sectionTitles[section]}</h1>
          <p>{sectionDescriptions[section]}</p>
        </div>
        {!loading && !loadFailed && (
          <div className="team-heading-badges">
            <span className="team-live-summary">
              <Users size={15} />
              <b>{activeMembers}</b>
              <span>usuarios con acceso</span>
            </span>
            <Link className="button button-outline team-personnel-shortcut" to="/operaciones/personal">
              <Briefcase size={15} />
              Ir a Personal, Salarios y Asistencia
            </Link>
          </div>
        )}
      </header>

      <nav className="team-subpages team-subpages-4" aria-label="Administración de usuarios, roles, permisos y personal">
        <Link className={section === 'usuarios' ? 'active' : ''} aria-current={section === 'usuarios' ? 'page' : undefined} to={teamPage('usuarios')}>
          <span className="team-subpage-index">01</span>
          <Users size={18} />
          <span className="team-subpage-copy">
            <b>Usuarios</b>
            <small>Cuentas, sucursales y fichas</small>
          </span>
          <span className="team-subpage-count">{loading || loadFailed ? '—' : accountDirectory.length}</span>
        </Link>
        <Link className={section === 'perfiles' ? 'active' : ''} aria-current={section === 'perfiles' ? 'page' : undefined} to={teamPage('perfiles')}>
          <span className="team-subpage-index">02</span>
          <IdCard size={18} />
          <span className="team-subpage-copy">
            <b>Perfiles y Roles</b>
            <small>Funciones y plantillas</small>
          </span>
          <span className="team-subpage-count">{loading || loadFailed ? '—' : visibleProfiles.length}</span>
        </Link>
        <Link className={section === 'permisos' ? 'active' : ''} aria-current={section === 'permisos' ? 'page' : undefined} to={teamPage('permisos')}>
          <span className="team-subpage-index">03</span>
          <ShieldCheck size={18} />
          <span className="team-subpage-copy">
            <b>Permisos y Descuentos</b>
            <small>Matriz y gobernanza</small>
          </span>
          <span className="team-subpage-count">{modules.length} mód.</span>
        </Link>
        <Link to="/operaciones/personal">
          <span className="team-subpage-index">04</span>
          <Briefcase size={18} />
          <span className="team-subpage-copy">
            <b>Personal y Salarios</b>
            <small>Nómina, asistencia y KPIs</small>
          </span>
          <span className="team-subpage-count">{loading || loadFailed ? '—' : personnelRecords.length}</span>
        </Link>
      </nav>

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="team-access-message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <section className="panel team-loading" role="status">
          <span className="team-loading-mark">
            <Users size={18} />
          </span>
          <p>Cargando usuarios, perfiles y permisos…</p>
        </section>
      ) : loadFailed ? (
        <section className="panel team-load-error" role="alert">
          <span className="team-empty-mark">
            <ShieldCheck size={20} />
          </span>
          <div>
            <b>No se pudieron cargar los datos del equipo</b>
            <p>{error || 'Comprueba la conexión e inténtalo de nuevo.'}</p>
          </div>
          <button className="button button-outline" type="button" onClick={() => void load()}>
            <RotateCcw size={15} />
            Reintentar
          </button>
        </section>
      ) : (
        <>
          {section === 'usuarios' && (
            <>
              <div className="team-metrics team-metrics-6" aria-label="Resumen ejecutivo de usuarios y gobernanza">
                <div>
                  <span className="team-metric-icon">
                    <Users size={17} />
                  </span>
                  <span>
                    <b>{accountDirectory.length}</b>
                    <small>Cuentas registradas</small>
                  </span>
                </div>
                <div>
                  <span className="team-metric-icon is-active">
                    <ShieldCheck size={17} />
                  </span>
                  <span>
                    <b>{activeMembers}</b>
                    <small>Con acceso activo</small>
                  </span>
                </div>
                <div>
                  <span className="team-metric-icon is-personnel">
                    <Briefcase size={17} />
                  </span>
                  <span>
                    <b>{linkedPersonnelAccountsCount}</b>
                    <small>Con ficha laboral</small>
                  </span>
                </div>
                <div>
                  <span className="team-metric-icon is-pending">
                    <UserPlus size={17} />
                  </span>
                  <span>
                    <b>{invitationLoadError ? '—' : invitations.length}</b>
                    <small>{invitationLoadError ? 'Invitaciones no disponibles' : 'Invitaciones pendientes'}</small>
                  </span>
                </div>
                <button
                  type="button"
                  className={`team-metric-button ${accessRequests.length > 0 ? 'has-requests' : ''}`}
                  aria-label={`Solicitudes pendientes: ${accessRequests.length}. Ir al panel de solicitudes`}
                  onClick={() => requestsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <span className="team-metric-icon is-requests">
                    <UserCheck size={17} />
                  </span>
                  <span>
                    <b>{accessRequests.length}</b>
                    <small>Solicitudes pendientes</small>
                  </span>
                </button>
                <div>
                  <span className="team-metric-icon is-discount">
                    <Percent size={17} />
                  </span>
                  <span>
                    <b>Máx. 40%</b>
                    <small>Tope descuento comercial POS</small>
                  </span>
                </div>
              </div>

              <div className="team-users-layout">
                <section className="panel team-users-panel" aria-labelledby="team-users-title">
                  <header className="team-panel-heading">
                    <div>
                      <span className="eyebrow">CUENTAS DEL ESPACIO</span>
                      <h2 id="team-users-title">Directorio de Usuarios y Accesos</h2>
                      <p>
                        {assignedAccounts} de {accountDirectory.length} cuentas tienen perfiles asignados · {linkedPersonnelAccountsCount} vinculadas a ficha de personal.
                      </p>
                    </div>
                    <span className="team-panel-mark">
                      <Users size={18} />
                    </span>
                  </header>

                  <div className="team-account-filters team-account-filters-extended">
                    <label className="team-account-search">
                      <Search size={16} aria-hidden="true" />
                      <span className="sr-only">Buscar por nombre, cargo o correo</span>
                      <input
                        type="search"
                        aria-label="Buscar por nombre, cargo o correo"
                        value={accountQuery}
                        onChange={(event) => setAccountQuery(event.target.value)}
                        placeholder="Buscar por nombre, cargo o correo"
                      />
                    </label>
                    <label className="team-account-state">
                      <span className="sr-only">Filtrar por perfil</span>
                      <select aria-label="Filtrar por perfil" value={profileFilterId} onChange={(event) => setProfileFilterId(event.target.value)}>
                        <option value="all">Todos los perfiles</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="team-account-state">
                      <span className="sr-only">Filtrar por sucursal</span>
                      <select aria-label="Filtrar por sucursal" value={branchFilterId} onChange={(event) => setBranchFilterId(event.target.value)}>
                        <option value="all">Todas las sucursales</option>
                        <option value="global">Acceso global</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name} ({branch.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="team-account-state">
                      <span className="sr-only">Filtrar usuarios por estado</span>
                      <select aria-label="Filtrar usuarios por estado" value={accountState} onChange={(event) => setAccountState(event.target.value as typeof accountState)}>
                        <option value="all">Todos los estados</option>
                        <option value="active">Con acceso activo</option>
                        <option value="blocked">Acceso pausado</option>
                        <option value="unassigned">Sin perfil asignado</option>
                        <option value="with_personnel">Con ficha laboral</option>
                        <option value="without_personnel">Sin ficha laboral</option>
                      </select>
                    </label>
                    <span className="team-account-result-count" aria-live="polite">
                      {filteredAccounts.length} de {accountDirectory.length}
                    </span>
                  </div>

                  <div className="team-quick-filter-pills" role="group" aria-label="Filtros rápidos de usuarios">
                    {[
                      ['all', `Todos (${accountDirectory.length})`],
                      ['active', `Activos (${activeMembers})`],
                      ['with_personnel', `Con ficha (${linkedPersonnelAccountsCount})`],
                      ['without_personnel', `Sin ficha (${Math.max(0, accountDirectory.length - linkedPersonnelAccountsCount)})`],
                      ['unassigned', `Sin perfil (${accountDirectory.filter((a) => a.memberships.length === 0).length})`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`team-filter-pill ${accountState === key ? 'active' : ''}`}
                        onClick={() => setAccountState(key as typeof accountState)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <p className="team-account-guidance">
                    Pausar bloquea el acceso al espacio. Quitar de Visual Corp retira sus perfiles, conserva la cuenta Google y preserva todo el historial de ventas, caja y producción.
                  </p>

                  {accountDirectory.length === 0 ? (
                    <div className="team-account-empty">
                      <span className="team-empty-mark">
                        <Users size={20} />
                      </span>
                      <b>Aún no hay usuarios registrados</b>
                      <span>Las cuentas aparecerán aquí cuando inicien sesión o reciban un perfil de acceso.</span>
                    </div>
                  ) : filteredAccounts.length === 0 ? (
                    <div className="team-account-empty">
                      <span className="team-empty-mark">
                        <Search size={20} />
                      </span>
                      <b>No encontramos coincidencias</b>
                      <span>Prueba con otro nombre, cargo, sucursal, perfil o estado.</span>
                    </div>
                  ) : (
                    <div className="team-access-list">
                      {filteredAccounts.map((account) => {
                        const accountActive = account.memberships.some((membership: any) => membership.active);
                        const protectedOwner = account.memberships.some((membership: any) => membership.role === 'owner');
                        const hasAdminMembership = account.memberships.some((membership: any) => ['admin', 'website_admin'].includes(membership.role));
                        const avatarUrl = account.googleAccount?.avatar_url;
                        const linkedWorker = account.linkedPersonnel;
                        const canSellPos = account.isOwner || account.effectivePerms.has('sales.edit');
                        const canSettleRefund = account.isOwner || account.effectivePerms.has('sales.settle_refund');
                        const canManageSalaries = account.isOwner || account.effectivePerms.has('personnel.edit_compensation');
                        const canEditPrices = account.isOwner || account.effectivePerms.has('catalog_admin.edit_prices');

                        const inlineBranchValue = canManageOrgWideMembers
                          ? inlineBranchByEmail[account.email] ?? ''
                          : inlineBranchByEmail[account.email] && manageableBranches.some((b) => b.id === inlineBranchByEmail[account.email])
                          ? inlineBranchByEmail[account.email]
                          : defaultScopedBranchId;
                        const inlineBranchId = inlineBranchValue || null;
                        const existingScopeKeys = new Set(
                          account.memberships.map((m: any) => `${m.profile_id || m.access_profile_id}:${m.branch_id || 'global'}`),
                        );
                        const availableProfilesForUser = profiles.filter(
                          (p) =>
                            canDelegateProfileForBranch(p, inlineBranchId) &&
                            !existingScopeKeys.has(`${p.id}:${inlineBranchId || 'global'}`),
                        );
                        const inlineSelectedProfile =
                          inlineAssignByEmail[account.email] && availableProfilesForUser.some((p) => p.id === inlineAssignByEmail[account.email])
                            ? inlineAssignByEmail[account.email]
                            : '';

                        return (
                          <article className="team-account-row" key={account.user_id}>
                            <div className="team-account-header">
                              <Avatar
                                name={account.full_name || account.email || 'Cuenta de equipo'}
                                src={avatarUrl}
                                size="sm"
                                className="activity-avatar"
                                badge={avatarUrl ? <span className="vc-google-avatar-mark">G</span> : undefined}
                              />
                              <span className="team-access-person">
                                <b>{account.full_name || account.email || 'Cuenta de equipo'}</b>
                                <small>{account.email || account.user_id}</small>
                                <span className="team-account-meta-chips">
                                  <span className="team-meta-chip">
                                    <Clock size={11} />
                                    {formatRelativeAccess(account.last_sign_in_at)}
                                  </span>
                                  {linkedWorker ? (
                                    <Link
                                      className="team-meta-chip is-linked-worker"
                                      to={`/operaciones/personal?ficha=${encodeURIComponent(linkedWorker.id)}`}
                                    >
                                      <Briefcase size={11} />
                                      Ficha: {linkedWorker.full_name}
                                      {linkedWorker.job_title ? ` · ${linkedWorker.job_title}` : ''}
                                    </Link>
                                  ) : account.googleAccount?.linked_personnel_name ? (
                                    <Link className="team-meta-chip is-linked-worker" to="/operaciones/personal">
                                      <Briefcase size={11} />
                                      Ficha: {account.googleAccount.linked_personnel_name}
                                    </Link>
                                  ) : (
                                    <Link className="team-meta-chip is-unlinked-worker" to="/operaciones/personal">
                                      <Briefcase size={11} />
                                      Vincular ficha laboral →
                                    </Link>
                                  )}
                                </span>
                              </span>
                              <span className={'team-access-role ' + (accountActive ? '' : 'inactive')}>
                                <span className="team-status-dot" aria-hidden="true" />
                                {account.memberships.length ? (accountActive ? 'Acceso activo' : 'Acceso pausado') : 'Sin perfil asignado'}
                                <small>
                                  {account.memberships.filter((membership: any) => membership.active).length} de {account.memberships.length} perfiles activos
                                </small>
                              </span>
                            </div>

                            {accountActive && (
                              <div className="team-account-capabilities" aria-label="Capacidades y políticas de gobernanza activas">
                                {canSellPos && (
                                  <span className="team-capability-badge is-pos" title="Puede emitir ventas y aplicar descuento comercial en POS hasta el 40% con motivo obligatorio">
                                    <Percent size={11} /> Descuento POS ≤ 40% (con motivo)
                                  </span>
                                )}
                                {canSettleRefund && (
                                  <span className="team-capability-badge is-refund">
                                    <BadgeDollarSign size={11} /> Liquidar devoluciones
                                  </span>
                                )}
                                {canEditPrices && (
                                  <span className="team-capability-badge is-prices">
                                    <KeyRound size={11} /> Editar tarifas
                                  </span>
                                )}
                                {canManageSalaries && (
                                  <span className="team-capability-badge is-salary">
                                    <ShieldCheck size={11} /> Salarios y descuentos RR.HH.
                                  </span>
                                )}
                              </div>
                            )}

                            {account.memberships.length > 0 ? (
                              <div className="team-account-profiles" aria-label={`Perfiles de ${account.full_name || account.email || 'la cuenta'}`}>
                                {account.memberships.map((member: any) => {
                                  const memberProfileId = member.profile_id || member.access_profile_id;
                                  const canToggleThisMember =
                                    canManageMembers &&
                                    member.role !== 'owner' &&
                                    (isOwner || !['admin', 'website_admin'].includes(member.role)) &&
                                    (member.branch_id ? hasPermission('team', 'manage_members', member.branch_id) : canManageOrgWideMembers);
                                  const canReassignBranch =
                                    canManageOrgWideMembers &&
                                    member.role !== 'owner' &&
                                    (isOwner || !['admin', 'website_admin'].includes(member.role)) &&
                                    branches.length > 0;

                                  return (
                                    <div className={'team-account-profile ' + (member.active ? '' : 'inactive')} key={member.id}>
                                      <span>
                                        <b>{member.access_profiles?.name || roleNames[member.role] || member.role}</b>
                                        <span className={`team-branch-badge ${member.branch_id ? 'is-branch' : 'is-global'}`}>
                                          <Building2 size={10} aria-hidden="true" />
                                          {member.branch_id
                                            ? member.branch_name || member.branch_code || 'Sucursal'
                                            : 'Todas las sucursales'}
                                        </span>
                                        <small>{member.active ? 'Activo' : 'Pausado'}</small>
                                      </span>
                                      <div className="team-member-chip-actions">
                                        {canReassignBranch && (
                                          <select
                                            className="team-member-branch-select"
                                            aria-label={`Sucursal para ${member.access_profiles?.name || member.role} de ${account.full_name || account.email}`}
                                            value={member.branch_id || ''}
                                            disabled={saving}
                                            onChange={(e) => void changeMembershipBranch(member, e.target.value)}
                                          >
                                            <option value="">Todas las sucursales</option>
                                            {branches.map((b) => (
                                              <option key={b.id} value={b.id}>
                                                {b.name} ({b.code})
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                        {memberProfileId && (
                                          <Link
                                            className="team-profile-inspect-link"
                                            to={`/operaciones/equipo/permisos?perfil=${encodeURIComponent(memberProfileId)}`}
                                            title="Ver permisos de este perfil"
                                          >
                                            Permisos
                                          </Link>
                                        )}
                                        {canToggleThisMember && (
                                          <button
                                            type="button"
                                            className="button button-outline team-member-toggle"
                                            disabled={saving}
                                            onClick={() => void setMemberActive(member)}
                                            aria-label={`${member.active ? 'Pausar' : 'Reactivar'} perfil ${
                                              member.access_profiles?.name || roleNames[member.role] || member.role
                                            } para ${account.full_name || account.email}`}
                                          >
                                            {member.active ? 'Pausar' : 'Reactivar'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="team-account-unassigned">La cuenta ya inició sesión, pero todavía no tiene perfiles asignados.</p>
                            )}

                            <div className="team-account-actions">
                              {canManageMembers && account.email && (canManageOrgWideMembers || manageableBranches.length > 0) && (
                                <div className="team-inline-assign">
                                  <select
                                    aria-label={`Sucursal al añadir perfil a ${account.full_name || account.email}`}
                                    value={inlineBranchValue}
                                    onChange={(e) => setInlineBranchByEmail((prev) => ({ ...prev, [account.email]: e.target.value }))}
                                    disabled={saving}
                                  >
                                    {canManageOrgWideMembers && <option value="">Todas las sucursales</option>}
                                    {manageableBranches.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.name} ({b.code})
                                      </option>
                                    ))}
                                  </select>
                                  {availableProfilesForUser.length > 0 && (
                                    <select
                                      aria-label={`Agregar perfil a ${account.full_name || account.email}`}
                                      value={inlineSelectedProfile}
                                      onChange={(e) => setInlineAssignByEmail((prev) => ({ ...prev, [account.email]: e.target.value }))}
                                      disabled={saving}
                                    >
                                      <option value="">+ Añadir perfil…</option>
                                      {availableProfilesForUser.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  {inlineSelectedProfile && (
                                    <button
                                      type="button"
                                      className="button button-dark team-inline-assign-btn"
                                      disabled={saving}
                                      onClick={() => void assignInlineProfileToAccount(account.email, inlineSelectedProfile, inlineBranchId)}
                                    >
                                      <Plus size={13} /> Asignar
                                    </button>
                                  )}
                                </div>
                              )}
                              {canManageOrgWideMembers && !protectedOwner && account.memberships.length > 0 && (isOwner || !hasAdminMembership) && (
                                <>
                                  <button
                                    type="button"
                                    className={accountActive ? 'team-account-block' : 'team-account-reactivate'}
                                    disabled={saving}
                                    onClick={() => void setAccountAccessActive(account, !accountActive)}
                                  >
                                    {accountActive ? (
                                      <>
                                        <Ban size={14} />
                                        Pausar todos
                                      </>
                                    ) : (
                                      <>
                                        <RotateCcw size={14} />
                                        Reactivar todos
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="team-account-remove"
                                    disabled={saving}
                                    onClick={() => void removeAccountAccess(account)}
                                  >
                                    <UserRoundX size={14} />
                                    Quitar de Visual Corp
                                  </button>
                                </>
                              )}
                              {protectedOwner && (
                                <span className="team-account-protected">
                                  <ShieldCheck size={14} /> Cuenta protegida (Propietario)
                                </span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <aside className="team-access-side">
                  <section
                    ref={requestsPanelRef}
                    className={`panel team-requests-panel ${accessRequests.length > 0 ? 'has-requests' : ''}`}
                    aria-labelledby="team-requests-title"
                  >
                    <header className="team-panel-heading">
                      <div>
                        <span className="eyebrow">COLA DE INGRESO</span>
                        <h2 id="team-requests-title">Solicitudes de acceso</h2>
                        <p>Cuentas que iniciaron sesión sin invitación y esperan que un administrador global les asigne perfil.</p>
                      </div>
                      <div className="team-requests-head-actions">
                        <span
                          className={`team-requests-badge ${accessRequests.length > 0 ? 'has-items' : ''}`}
                          aria-label={`${accessRequests.length} solicitudes pendientes`}
                        >
                          {accessRequests.length}
                        </span>
                        {canManageOrgWideMembers && (
                          <button
                            type="button"
                            className="button button-outline team-requests-refresh"
                            disabled={requestsRefreshing}
                            onClick={() => void reloadAccessRequests(true)}
                            aria-label="Actualizar solicitudes de acceso"
                            title="Actualizar solicitudes de acceso"
                          >
                            <RotateCcw size={13} className={requestsRefreshing ? 'is-spinning' : ''} />
                            <span>{requestsRefreshing ? 'Actualizando…' : 'Actualizar'}</span>
                          </button>
                        )}
                      </div>
                    </header>

                    {!canManageOrgWideMembers ? (
                      <p className="team-access-help">
                        La cola global de solicitudes solo está disponible para administradores con alcance en toda la organización.
                      </p>
                    ) : accessRequests.length === 0 ? (
                      <div className="team-requests-empty" role="status">
                        <span className="team-empty-mark">
                          <UserCheck size={18} />
                        </span>
                        <div>
                          <b>Nadie está esperando acceso</b>
                          <p>Cuando un compañero inicie sesión con Google sin invitación, aparecerá aquí para aprobarlo en un clic.</p>
                        </div>
                      </div>
                    ) : (
                      <ul className="team-request-list">
                        {accessRequests.map((req) => {
                          const reqBranchValue = requestBranchesById[req.id] ?? '';
                          const reqBranchId = reqBranchValue || null;
                          const eligibleProfiles = profiles.filter((p) => canDelegateProfileForBranch(p, reqBranchId));
                          const reqSelectedProfile =
                            requestProfilesById[req.id] && eligibleProfiles.some((p) => p.id === requestProfilesById[req.id])
                              ? requestProfilesById[req.id]
                              : eligibleProfiles[0]?.id || '';
                          const isRowLoading = requestLoadingId === req.id;
                          const seenAt = req.last_seen_at || req.requested_at;
                          const attempts = Number(req.request_count) || 1;
                          return (
                            <li className="team-request-card" key={req.id}>
                              <div className="team-request-person">
                                <Avatar
                                  name={req.full_name || req.email || 'Solicitante'}
                                  src={req.avatar_url}
                                  size="sm"
                                  className="activity-avatar"
                                  badge={req.avatar_url ? <span className="vc-google-avatar-mark">G</span> : undefined}
                                />
                                <div className="team-request-copy">
                                  <b>{req.full_name || req.email || 'Cuenta Google'}</b>
                                  <small>{req.email}</small>
                                  <div className="team-request-meta">
                                    <span className="team-meta-chip">
                                      <Clock size={11} />
                                      {formatRelativeAccess(seenAt)}
                                    </span>
                                    <span className="team-meta-chip is-attempts">
                                      {attempts} {attempts === 1 ? 'intento' : 'intentos'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="team-request-controls">
                                <label className="team-request-select-wrap">
                                  <span className="sr-only">Sucursal para {req.full_name || req.email}</span>
                                  <select
                                    aria-label={`Sucursal para ${req.full_name || req.email}`}
                                    value={reqBranchValue}
                                    disabled={isRowLoading}
                                    onChange={(event) =>
                                      setRequestBranchesById((prev) => ({
                                        ...prev,
                                        [req.id]: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Todas las sucursales</option>
                                    {branches.map((branch) => (
                                      <option key={branch.id} value={branch.id}>
                                        {branch.name} ({branch.code})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="team-request-select-wrap">
                                  <span className="sr-only">Perfil para {req.full_name || req.email}</span>
                                  <select
                                    aria-label={`Perfil para ${req.full_name || req.email}`}
                                    value={reqSelectedProfile}
                                    disabled={isRowLoading || eligibleProfiles.length === 0}
                                    onChange={(event) =>
                                      setRequestProfilesById((prev) => ({
                                        ...prev,
                                        [req.id]: event.target.value,
                                      }))
                                    }
                                  >
                                    {eligibleProfiles.length === 0 ? (
                                      <option value="">Sin perfiles asignables</option>
                                    ) : (
                                      eligibleProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                          {profile.name}
                                        </option>
                                      ))
                                    )}
                                  </select>
                                </label>
                                <div className="team-request-buttons">
                                  <button
                                    type="button"
                                    className="button button-dark team-request-approve"
                                    disabled={isRowLoading || !reqSelectedProfile}
                                    onClick={() => void approveAccessRequest(req)}
                                  >
                                    <Check size={14} />
                                    {isRowLoading ? 'Procesando…' : 'Aprobar'}
                                  </button>
                                  <button
                                    type="button"
                                    className="button button-outline team-request-dismiss"
                                    disabled={isRowLoading}
                                    onClick={() => void dismissAccessRequest(req)}
                                  >
                                    Descartar
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <section className="panel team-invite-panel" aria-labelledby="team-invite-title">
                    <header className="team-panel-heading">
                      <div>
                        <span className="eyebrow">NUEVO ACCESO</span>
                        <h2 id="team-invite-title">Asignar o invitar por correo</h2>
                        <p>Agrega una cuenta Google al espacio y asígnale su perfil y sucursal.</p>
                      </div>
                      <span className="team-panel-mark is-accent">
                        <UserPlus size={18} />
                      </span>
                    </header>
                    {canManageMembers ? (
                      <>
                        <form onSubmit={assign} className="team-access-form">
                          <label>
                            Correo de la cuenta
                            <input
                              required
                              type="email"
                              autoComplete="email"
                              value={email}
                              onChange={(event) => setEmail(event.target.value)}
                              placeholder="persona@visualcorp.com"
                            />
                          </label>
                          <label>
                            Sucursal de acceso
                            <select
                              aria-label="Sucursal de acceso"
                              value={effectiveAssignBranchId}
                              onChange={(event) => {
                                setAssignBranchId(event.target.value);
                                setAssignProfileId('');
                              }}
                            >
                              {canManageOrgWideMembers && <option value="">Todas las sucursales (acceso global)</option>}
                              {manageableBranches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                  {branch.name} ({branch.code})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Perfil de acceso
                            <select required value={assignProfileId} onChange={(event) => setAssignProfileId(event.target.value)}>
                              <option value="">Selecciona un perfil</option>
                              {assignableProfilesForInvite.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="team-access-help">
                            Solo puedes delegar perfiles dentro de tu rol base, tus permisos y las sucursales que administras. Si la cuenta aún no existe, se crea una invitación por 7 días.
                          </p>
                          <button
                            className="button button-dark team-invite-submit"
                            type="submit"
                            disabled={saving || !assignProfileId || (!canManageOrgWideMembers && !effectiveAssignBranchId)}
                          >
                            <UserPlus size={15} />
                            {saving ? 'Guardando…' : 'Asignar o invitar'}
                          </button>
                        </form>
                        {lastInvitationEmail && (
                          <div className="team-invite-share-box" role="region" aria-label="Mensaje de invitación listo para copiar">
                            <p className="team-invite-share-copy">
                              <code>
                                Ingresa a {typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://visualcorp-suite.vercel.app'} con Google usando {lastInvitationEmail}
                              </code>
                            </p>
                            <button
                              type="button"
                              className="button button-outline team-invite-copy-btn"
                              onClick={() => void copyInvitationMessage(lastInvitationEmail)}
                            >
                              {copiedInvitationEmail === lastInvitationEmail ? <Check size={14} /> : <Copy size={14} />}
                              {copiedInvitationEmail === lastInvitationEmail ? 'Mensaje copiado' : 'Copiar mensaje de invitación'}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="team-access-help">
                        Tu perfil permite consultar usuarios. Para asignar accesos, solicita el permiso a una persona administradora.
                      </p>
                    )}
                  </section>

                  {canManageMembers && (
                    <section className="panel team-invitations" aria-labelledby="team-invitations-title">
                      <header className="team-panel-heading">
                        <div>
                          <span className="eyebrow">PENDIENTES</span>
                          <h2 id="team-invitations-title">Invitaciones</h2>
                        </div>
                        <span className="team-invitation-count">{invitations.length}</span>
                      </header>
                      {invitationLoadError ? (
                        <p className="team-access-help" role="status">
                          No se pudo consultar el estado de las invitaciones. Vuelve a intentarlo más tarde.
                        </p>
                      ) : invitations.length === 0 ? (
                        <div className="team-empty-invitations-box">
                          <b>No hay invitaciones pendientes</b>
                          <p>
                            Si invitas un correo que aún no ha iniciado sesión, quedará reservado aquí durante 7 días y podrás copiar el enlace para enviárselo por WhatsApp o correo.
                          </p>
                        </div>
                      ) : (
                        <ul className="team-invitation-list">
                          {invitations.map((invitation) => (
                            <li className="team-invitation" key={invitation.id}>
                              <span>
                                <b>{invitation.invited_email}</b>
                                <small>
                                  {invitation.profile_name} ·{' '}
                                  <span className={`team-branch-badge ${invitation.branch_id ? 'is-branch' : 'is-global'}`}>
                                    {invitation.branch_id ? invitation.branch_name || invitation.branch_code || 'Sucursal' : 'Todas las sucursales'}
                                  </span>{' '}
                                  · vence {new Date(invitation.expires_at).toLocaleDateString('es-EC')}
                                </small>
                              </span>
                              <div className="team-invitation-actions">
                                <button
                                  className="button button-outline team-invitation-copy"
                                  type="button"
                                  onClick={() => void copyInvitationMessage(invitation.invited_email)}
                                  aria-label={`Copiar mensaje de invitación para ${invitation.invited_email}`}
                                  title="Copiar mensaje de invitación"
                                >
                                  {copiedInvitationEmail === invitation.invited_email ? <Check size={12} /> : <Copy size={12} />}
                                  <span>{copiedInvitationEmail === invitation.invited_email ? 'Copiado' : 'Copiar mensaje'}</span>
                                </button>
                                <button
                                  className="team-invitation-revoke"
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void revokeInvitation(invitation)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  <section className="panel team-governance-card" aria-label="Resumen de reglas de descuentos y salarios">
                    <header className="team-panel-heading">
                      <div>
                        <span className="eyebrow">POLÍTICAS ACTIVAS</span>
                        <h2>Descuentos, Caja y Salarios</h2>
                      </div>
                      <span className="team-panel-mark">
                        <Percent size={17} />
                      </span>
                    </header>
                    <ul className="team-governance-list">
                      <li>
                        <b>Cajero vs Supervisor:</b> <code>cash.manage_cash</code> habilita operación y movimientos de caja; <code>finance.manage_finance</code> habilita egresos y finanzas de la sucursal.
                      </li>
                      <li>
                        <b>Descuento comercial POS:</b> Tope automático del <b>40%</b> sobre el subtotal y motivo obligatorio auditado en la venta.
                      </li>
                      <li>
                        <b>Descuentos de nómina (Personal):</b> Los anticipos, préstamos o deducciones al trabajador se registran en{' '}
                        <Link to="/operaciones/personal">Personal → Salarios y Descuentos</Link>.
                      </li>
                      <li>
                        <b>Liquidación de devoluciones:</b> Requiere <code>sales.view</code>, <code>cash.view</code>, <code>cash.edit</code> y <code>sales.settle_refund</code>.
                      </li>
                    </ul>
                  </section>
                </aside>
              </div>
            </>
          )}

          {section === 'perfiles' && (
            <div className="team-profiles-layout">
              <aside className="panel team-profile-directory" aria-labelledby="team-profile-directory-title">
                <header className="team-panel-heading">
                  <div>
                    <span className="eyebrow">ROLES DEL EQUIPO</span>
                    <h2 id="team-profile-directory-title">Perfiles configurados</h2>
                    <p>Elige un perfil para revisar sus usuarios, rol base y permisos.</p>
                  </div>
                  <span className="team-panel-mark">
                    <IdCard size={18} />
                  </span>
                </header>
                {canManageProfiles && (
                  <button className="button button-dark team-create-profile" type="button" onClick={createProfile}>
                    <Plus size={15} />
                    Crear nuevo perfil
                  </button>
                )}
                {visibleProfiles.length === 0 ? (
                  <div className="team-account-empty">
                    <b>No hay perfiles configurables</b>
                    <span>Crea un perfil para definir un conjunto de permisos.</span>
                  </div>
                ) : (
                  <div className="team-profile-list" role="list">
                    {visibleProfiles.map((profile) => {
                      const pSet = permissionsByProfileId.get(profile.id) || new Set<string>();
                      const viewModulesCount = modules.filter(([m]) => pSet.has(`${m}.view`)).length;
                      const editModulesCount = modules.filter(([m]) => pSet.has(`${m}.edit`)).length;
                      const memberStats = memberCountByProfileId.get(profile.id) || { total: 0, active: 0 };

                      return (
                        <button
                          type="button"
                          role="listitem"
                          key={profile.id}
                          className={`team-profile-choice ${selectedId === profile.id ? 'active' : ''}`}
                          aria-pressed={selectedId === profile.id}
                          onClick={() => selectProfile(profile.id)}
                        >
                          <span className="team-profile-choice-icon">
                            <IdCard size={17} />
                          </span>
                          <span className="team-profile-choice-copy">
                            <b>{profile.name}</b>
                            <small>{profile.description || 'Sin descripción adicional'}</small>
                            <span className="team-profile-choice-metrics">
                              <em>Base: {roleNames[profile.base_role] || profile.base_role}</em>
                              <em>{memberStats.active} activos</em>
                              <em>{viewModulesCount} consulta · {editModulesCount} edición</em>
                            </span>
                          </span>
                          <span className={`team-profile-state ${profile.active ? 'is-active' : ''}`}>
                            <i aria-hidden="true" />
                            {profile.active ? 'Activo' : 'Pausado'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </aside>

              <section className="panel team-profile-editor" aria-labelledby="team-profile-editor-title">
                <header className="team-panel-heading">
                  <div>
                    <span className="eyebrow">CONFIGURACIÓN DEL PERFIL</span>
                    <h2 id="team-profile-editor-title">{selectedProfile?.name || 'Nuevo perfil'}</h2>
                    <p>
                      {selectedProfile
                        ? 'Define el nombre, rol base y descripción, o aplica una plantilla rápida de funciones operativas.'
                        : 'Empieza con un nombre claro, elige el rol base del sistema o selecciona una plantilla rápida.'}
                    </p>
                  </div>
                  <span className="team-panel-mark is-accent">
                    <IdCard size={18} />
                  </span>
                </header>

                {selectedProfile && (
                  <div className="team-profile-current">
                    <span className={`team-profile-state ${selectedProfile.active ? 'is-active' : ''}`}>
                      <i aria-hidden="true" />
                      {selectedProfile.active ? 'Perfil activo' : 'Perfil pausado'}
                    </span>
                    <span className="team-branch-badge is-global">
                      Rol base: {roleNames[selectedProfile.base_role] || selectedProfile.base_role}
                    </span>
                    <span>
                      <b>{memberCountByProfileId.get(selectedProfile.id)?.active || 0}</b> cuentas activas con este perfil ·{' '}
                      <b>{activeMatrixSummary.viewCount}</b> módulos con consulta · <b>{activeMatrixSummary.editCount}</b> con edición ·{' '}
                      <b>{activeMatrixSummary.specialCount}</b> permisos especiales.
                    </span>
                  </div>
                )}

                {canEditSelectedProfile && (
                  <div className="team-role-presets" aria-label="Plantillas rápidas de rol">
                    <div className="team-role-presets-head">
                      <span>
                        <Sparkles size={14} /> <b>Plantillas rápidas de rol</b> — Precarga permisos y rol base en 1 clic
                      </span>
                    </div>
                    <div className="team-role-presets-grid">
                      {ROLE_PRESETS.map((preset) => {
                        const presetAllowed = canUsePreset(preset);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            className="team-role-preset-card"
                            disabled={!presetAllowed}
                            title={presetAllowed ? preset.description : 'Este preset excede tu rol base o permisos globales'}
                            onClick={() => applyRolePreset(preset)}
                          >
                            <span className="team-role-preset-badge">{preset.badge}</span>
                            <b>{preset.name}</b>
                            <small>{preset.description}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <form className="team-profile-form" onSubmit={saveProfile}>
                  <div className="team-profile-fields">
                    <label>
                      Nombre del perfil
                      <input
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        disabled={!canEditSelectedProfile}
                        placeholder="Ej. Asesora Comercial y POS"
                      />
                    </label>
                    <label>
                      Identificador interno
                      <input
                        value={profileKey}
                        onChange={(event) => setProfileKey(event.target.value)}
                        required
                        pattern="[a-z0-9_]{2,48}"
                        disabled={!canEditSelectedProfile || Boolean(selectedId)}
                        aria-describedby="team-profile-key-help"
                      />
                      <small id="team-profile-key-help">Solo minúsculas, números y guion bajo.</small>
                    </label>
                    <label>
                      Rol base del sistema
                      <select
                        aria-label="Rol base del sistema"
                        value={profileBaseRole}
                        onChange={(event) => setProfileBaseRole(event.target.value)}
                        disabled={!canEditSelectedProfile || Boolean(selectedProfile?.is_system)}
                      >
                        {assignableBaseRoles.map((option) => {
                          const roleAllowed = isOwner || (!option.ownerOnly && canActorManageBaseRole(orgWideActorRoles, option.value));
                          return (
                            <option
                              key={option.value}
                              value={option.value}
                              disabled={!roleAllowed}
                            >
                              {option.label}
                            </option>
                          );
                        })}
                      </select>
                      <small>
                        {selectedProfile?.is_system
                          ? 'El rol base de los perfiles del sistema está protegido.'
                          : 'Define el techo técnico en políticas SQL y auditoría.'}
                      </small>
                    </label>
                    <label className="team-profile-description">
                      Descripción operativa
                      <input
                        value={profileDescription}
                        onChange={(event) => setProfileDescription(event.target.value)}
                        maxLength={300}
                        disabled={!canEditSelectedProfile}
                        placeholder="Qué tareas, módulos y límites operativos tiene este perfil"
                      />
                    </label>
                  </div>
                  <div className="team-profile-edit-hint">
                    <ShieldCheck size={16} />
                    <p>
                      Ajusta al detalle qué módulos puede consultar, editar o eliminar este perfil, incluyendo permisos de descuentos, caja y salarios.
                    </p>
                    <Link to={teamPage('permisos')}>Configurar matriz de permisos →</Link>
                  </div>
                  <div className="team-profile-actions">
                    {canEditSelectedProfile && (
                      <button className="button button-dark" type="submit" disabled={saving}>
                        <Save size={15} />
                        {saving ? 'Guardando…' : 'Guardar perfil'}
                      </button>
                    )}
                    {selectedProfile && canEditSelectedProfile && (
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={setProfileActive}
                        disabled={saving || ((selectedProfile.profile_key === 'admin' || selectedProfile.base_role === 'admin') && !isOwner)}
                      >
                        <RotateCcw size={15} />
                        {selectedProfile.active ? 'Pausar perfil' : 'Reactivar perfil'}
                      </button>
                    )}
                    {!canEditSelectedProfile && (
                      <p className="team-access-help">
                        {selectedProfile && ['admin', 'website_admin'].includes(selectedProfile.base_role)
                          ? 'Solo el propietario puede modificar o desactivar perfiles administrativos o de sitio web.'
                          : 'Puedes consultar estos perfiles. La configuración está reservada a cuentas con permiso de gestión en toda la organización.'}
                      </p>
                    )}
                  </div>
                </form>
              </section>
            </div>
          )}

          {section === 'permisos' && (
            <section className="panel team-permissions-panel" aria-labelledby="team-permissions-title">
              <header className="team-panel-heading team-permissions-heading">
                <div>
                  <span className="eyebrow">CONTROL DE ACCESO Y GOBERNANZA</span>
                  <h2 id="team-permissions-title">Matriz de Permisos por Perfil</h2>
                  <p>Selecciona un perfil para gestionar sus accesos por módulo, descuentos comerciales, precios y salarios.</p>
                </div>
                <span className="team-panel-mark is-accent">
                  <ShieldCheck size={18} />
                </span>
              </header>

              <div className="team-permission-toolbar">
                <label>
                  Perfil activo
                  <select value={selectedId} onChange={(event) => selectProfile(event.target.value)}>
                    <option value="">Selecciona un perfil</option>
                    {visibleProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                        {profile.active ? '' : ' · Pausado'}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedProfile && (
                  <div className="team-permission-toolbar-meta">
                    <span className={`team-profile-state ${selectedProfile.active ? 'is-active' : ''}`}>
                      <i aria-hidden="true" />
                      {selectedProfile.name} · {selectedProfile.active ? 'Activo' : 'Pausado'}
                    </span>
                    <span className="team-matrix-kpi-pill">
                      <b>{activeMatrixSummary.viewCount}</b> consulta · <b>{activeMatrixSummary.editCount}</b> edición ·{' '}
                      <b>{activeMatrixSummary.specialCount}</b> especiales
                    </span>
                  </div>
                )}
              </div>

              {selectedProfile ? (
                <form className="team-profile-form" onSubmit={saveProfile}>
                  <div className="team-governance-grid" aria-label="Gobernanza comercial, descuentos y salarios del perfil">
                    <div className={`team-gov-box ${matrix['sales.edit'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <Percent size={15} />
                        <b>Descuentos Comerciales POS y Ventas</b>
                        <span className="team-gov-status">{matrix['sales.edit'] ? 'Habilitado' : 'Solo lectura'}</span>
                      </div>
                      <p>
                        Al habilitar <b>Ventas y POS (Editar)</b>, el perfil puede aplicar descuentos en POS/Cotizador hasta el <b>tope del 40%</b> con motivo obligatorio registrado.
                      </p>
                      {canEditSelectedProfile && (
                        <label className="team-gov-quick-check">
                          <input
                            type="checkbox"
                            checked={Boolean(matrix['sales.edit'])}
                            disabled={!isOwner && !hasPermission('sales', 'edit', null)}
                            onChange={(e) => setPermission('sales.edit', e.target.checked)}
                          />
                          <span>Permitir emitir ventas y aplicar descuentos comerciales (≤40%)</span>
                        </label>
                      )}
                    </div>

                    <div className={`team-gov-box ${matrix['sales.settle_refund'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <BadgeDollarSign size={15} />
                        <b>Liquidación de Devoluciones en Caja</b>
                        <span className="team-gov-status">{matrix['sales.settle_refund'] ? 'Autorizado' : 'Restringido'}</span>
                      </div>
                      <p>
                        Controla quién puede ejecutar devoluciones en efectivo o transferencia. Activa automáticamente <b>Ventas (Ver)</b>, <b>Caja (Ver)</b> y <b>Caja (Editar)</b>.
                      </p>
                      {canEditSelectedProfile && (
                        <label className="team-gov-quick-check">
                          <input
                            type="checkbox"
                            checked={Boolean(matrix['sales.settle_refund'])}
                            disabled={
                              !isOwner &&
                              (!hasPermission('sales', 'settle_refund', null) ||
                                !hasPermission('sales', 'view', null) ||
                                !hasPermission('cash', 'edit', null))
                            }
                            onChange={(e) => setPermission('sales.settle_refund', e.target.checked)}
                          />
                          <span>Autorizar liquidación de devoluciones en caja</span>
                        </label>
                      )}
                    </div>

                    <div className={`team-gov-box ${matrix['catalog_admin.edit_prices'] || matrix['inventory_costs.view_costs'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <KeyRound size={15} />
                        <b>Tarifas de Catálogo y Costos</b>
                        <span className="team-gov-status">
                          {matrix['catalog_admin.edit_prices'] ? 'Edita precios' : matrix['inventory_costs.view_costs'] ? 'Ve costos' : 'Protegido'}
                        </span>
                      </div>
                      <p>
                        Separa la consulta del catálogo de la edición de precios base (Normal, Instalación, Corporativo) y del costo confidencial de inventario.
                      </p>
                      {canEditSelectedProfile && (
                        <div className="team-gov-dual-checks">
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['catalog_admin.edit_prices'])}
                              disabled={
                                !isOwner &&
                                (!hasPermission('catalog_admin', 'edit_prices', null) || !hasPermission('catalog_admin', 'edit', null))
                              }
                              onChange={(e) => setPermission('catalog_admin.edit_prices', e.target.checked)}
                            />
                            <span>Editar precios del catálogo</span>
                          </label>
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['inventory_costs.view_costs'])}
                              disabled={!isOwner && !hasPermission('inventory_costs', 'view_costs', null)}
                              onChange={(e) => setPermission('inventory_costs.view_costs', e.target.checked)}
                            />
                            <span>Ver costos de inventario</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className={`team-gov-box ${matrix['personnel.edit_compensation'] || matrix['finance.manage_finance'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <Briefcase size={15} />
                        <b>Salarios, Nómina y Descuentos RR.HH.</b>
                        <span className="team-gov-status">
                          {matrix['personnel.edit_compensation'] ? 'Edita salarios' : matrix['personnel.view_compensation'] ? 'Consulta salarios' : 'Oculto'}
                        </span>
                      </div>
                      <p>
                        Autoriza ver o modificar el salario base del trabajador, registrar descuentos de nómina (anticipos, multas, préstamos) y administrar finanzas.
                      </p>
                      {canEditSelectedProfile && (
                        <div className="team-gov-dual-checks">
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['personnel.view_compensation'])}
                              disabled={!isOwner && !hasPermission('personnel', 'view_compensation', null)}
                              onChange={(e) => setPermission('personnel.view_compensation', e.target.checked)}
                            />
                            <span>Ver salarios y descuentos</span>
                          </label>
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['personnel.edit_compensation'])}
                              disabled={!isOwner && !hasPermission('personnel', 'edit_compensation', null)}
                              onChange={(e) => setPermission('personnel.edit_compensation', e.target.checked)}
                            />
                            <span>Editar salarios y deducciones</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="team-matrix-controls">
                    <label className="team-matrix-search">
                      <Filter size={15} />
                      <input
                        type="search"
                        value={matrixFilter}
                        onChange={(e) => setMatrixFilter(e.target.value)}
                        placeholder="Filtrar módulo en la matriz…"
                      />
                    </label>
                    {canEditSelectedProfile && (
                      <div className="team-matrix-bulk-buttons">
                        <button type="button" className="button button-outline" onClick={() => applyBulkMatrixAction('all_view')}>
                          Marcar todo Consultar
                        </button>
                        <button type="button" className="button button-outline" onClick={() => applyBulkMatrixAction('all_edit')}>
                          Marcar todo Editar
                        </button>
                        <button type="button" className="button button-outline" onClick={() => applyBulkMatrixAction('clear_all')}>
                          Limpiar todo
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="team-permissions-help">
                    Activa solo lo que este perfil necesita. Permitir editar habilita también la consulta de ese módulo. El perfil Propietario está protegido.
                  </p>

                  <div className="table-wrap team-matrix-wrap">
                    <table className="team-permission-matrix">
                      <caption className="sr-only">Permisos de consulta, edición y eliminación por módulo</caption>
                      <thead>
                        <tr>
                          <th scope="col">Módulo</th>
                          <th scope="col">Consultar</th>
                          <th scope="col">Editar</th>
                          <th scope="col">Eliminar</th>
                          {canEditSelectedProfile && <th scope="col">Fila rápida</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredModules.map(([key, label]) => {
                          const hasViewAndEdit = Boolean(matrix[`${key}.view`]) && Boolean(matrix[`${key}.edit`]);
                          return (
                            <tr key={key}>
                              <th scope="row">
                                <div className="team-module-cell">
                                  <b>{label}</b>
                                  <small>{key}</small>
                                </div>
                              </th>
                              {(['view', 'edit', 'delete_records'] as const).map((action) => (
                                <td key={action}>
                                  <label className="team-permission-toggle">
                                    <input
                                      aria-label={`${label}: ${action === 'view' ? 'consultar' : action === 'edit' ? 'editar' : 'eliminar registros'}`}
                                      type="checkbox"
                                      checked={Boolean(matrix[`${key}.${action}`])}
                                      disabled={
                                        !canEditSelectedProfile ||
                                        (!isOwner && !hasPermission(key, action, null)) ||
                                        (key === 'personnel' && action === 'delete_records') ||
                                        (action === 'delete_records' && selectedProfile.profile_key === 'admin')
                                      }
                                      onChange={(event) => setPermission(`${key}.${action}`, event.target.checked)}
                                    />
                                    <span aria-hidden="true" />
                                  </label>
                                </td>
                              ))}
                              {canEditSelectedProfile && (
                                <td>
                                  <button
                                    type="button"
                                    className="team-row-quick-btn"
                                    onClick={() => toggleModuleRowAll(key, !hasViewAndEdit)}
                                  >
                                    {hasViewAndEdit ? 'Quitar' : 'Consultar + Editar'}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <details className="team-advanced-permissions" open>
                    <summary>
                      <span>Acciones especiales ({activeMatrixSummary.specialCount} activas)</span>
                      <small>Permisos concretos para descuentos, devoluciones, costos, salarios, taller y administración</small>
                    </summary>
                    <div className="team-special-grid">
                      {specialActions.map(({ module, action, label }) => (
                        <label key={`${module}.${action}`} className={matrix[`${module}.${action}`] ? 'is-checked' : ''}>
                          <input
                            type="checkbox"
                            checked={Boolean(matrix[`${module}.${action}`])}
                            disabled={!canEditSelectedProfile || (!isOwner && !hasPermission(module, action, null))}
                            onChange={(event) => setPermission(`${module}.${action}`, event.target.checked)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </details>

                  <div className="team-profile-actions">
                    {canEditSelectedProfile && (
                      <button className="button button-dark" type="submit" disabled={saving}>
                        <Save size={15} />
                        {saving ? 'Guardando…' : 'Guardar permisos'}
                      </button>
                    )}
                    {!canEditSelectedProfile && (
                      <p className="team-access-help">
                        {['admin', 'website_admin'].includes(selectedProfile.base_role)
                          ? 'Solo el propietario puede modificar permisos de perfiles administrativos o de sitio web.'
                          : 'Puedes consultar la matriz. Cambiar permisos requiere autorización de gestión de perfiles en toda la organización.'}
                      </p>
                    )}
                  </div>
                </form>
              ) : (
                <div className="team-permissions-empty">
                  <span className="team-empty-mark">
                    <ShieldCheck size={20} />
                  </span>
                  <b>Primero selecciona un perfil</b>
                  <span>La matriz aparecerá aquí para que puedas revisar sus accesos.</span>
                  <Link className="button button-outline" to={teamPage('perfiles')}>
                    Ver perfiles
                  </Link>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <aside className="notice-box team-access-note">
        <span>
          <Check size={17} />
        </span>
        <div>
          <b>La base central valida cada cambio</b>
          <p>Los permisos, sucursales y roles base se verifican en Supabase. El perfil Propietario permanece reservado.</p>
        </div>
      </aside>
    </div>
  );
}
