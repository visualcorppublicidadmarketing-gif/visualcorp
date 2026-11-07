import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  Ban,
  Briefcase,
  Check,
  Clock,
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
import { legacyRoleNames, permissionModules, specialPermissionActions } from '../auth/accessCatalog';
import './team-access.css';

const modules = permissionModules;
const specialActions = specialPermissionActions;
const roleNames = legacyRoleNames;

interface RolePreset {
  id: string;
  name: string;
  keySuggestion: string;
  badge: string;
  description: string;
  permissions: string[];
}

const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'advisor_pos',
    name: 'Asesora Comercial y POS',
    keySuggestion: 'asesora_comercial_pos',
    badge: 'Ventas · POS · CRM',
    description: 'Atiende clientes, emite cotizaciones, registra ventas en POS (con descuento comercial máx. 40% justificado) y opera su turno de caja.',
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
    badge: 'Caja · Abonos · Devoluciones',
    description: 'Administra aperturas y cierres de caja, cobros de saldos pendientes y liquidación autorizada de devoluciones.',
    permissions: [
      'dashboard.view',
      'sales.view',
      'sales.edit',
      'cash.view',
      'cash.edit',
      'cash.settle_refund',
      'crm.view',
      'quotes.view',
      'finance.view',
    ],
  },
  {
    id: 'workshop_lead',
    name: 'Jefe de Taller y Producción',
    keySuggestion: 'jefe_taller_produccion',
    badge: 'Taller · OT · Inventario',
    description: 'Coordina órdenes de trabajo, asigna responsables de producción, cambia etapas, cierra órdenes y registra consumo de materiales.',
    permissions: [
      'dashboard.view',
      'workshop.view',
      'workshop.edit',
      'workshop.assign_responsible',
      'workshop.change_stage',
      'workshop.close_order',
      'inventory.view',
      'inventory.edit',
      'inventory.adjust_stock',
      'quotes.view',
      'sales.view',
    ],
  },
  {
    id: 'warehouse_purchasing',
    name: 'Bodega, Compras y Costos',
    keySuggestion: 'bodega_compras_costos',
    badge: 'Stock · Costos · Proveedores',
    description: 'Controla existencias físicas, ajustes de conteo, costos unitarios de inventario y órdenes de compra a proveedores.',
    permissions: [
      'dashboard.view',
      'inventory.view',
      'inventory.edit',
      'inventory.adjust_stock',
      'inventory_costs.view',
      'inventory_costs.edit',
      'inventory_costs.view_cost',
      'purchases.view',
      'purchases.edit',
      'purchases.approve_purchase',
      'catalog_admin.view',
    ],
  },
  {
    id: 'marketing_web',
    name: 'Marketing y Sitio Web',
    keySuggestion: 'marketing_contenido_web',
    badge: 'Campañas · Web · Catálogo',
    description: 'Gestiona campañas publicitarias, publicaciones del sitio web, portafolio y fichas comerciales del catálogo.',
    permissions: [
      'dashboard.view',
      'marketing.view',
      'marketing.edit',
      'marketing.publish_campaign',
      'website.view',
      'website.edit',
      'website.publish',
      'catalog_admin.view',
      'catalog_admin.edit',
      'crm.view',
    ],
  },
  {
    id: 'hr_finance_admin',
    name: 'Administración, RR.HH. y Finanzas',
    keySuggestion: 'admin_rrhh_finanzas',
    badge: 'Finanzas · Salarios · Descuentos',
    description: 'Supervisa flujo financiero, fichas laborales, salarios base, descuentos de nómina, asistencia y precios de catálogo.',
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
      'cash.view',
      'cash.edit',
      'cash.settle_refund',
      'sales.view',
      'sales.edit',
      'quotes.view',
      'quotes.edit',
      'crm.view',
      'crm.edit',
      'inventory.view',
      'inventory_costs.view',
      'inventory_costs.view_cost',
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
  const { organizationId, roles, hasPermission, refreshAccess } = useAuth();
  const confirm = useConfirm();
  const canManageProfiles = hasPermission('team', 'manage_profiles');
  const canManageMembers = hasPermission('team', 'manage_members');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
  const [personnelRecords, setPersonnelRecords] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitationLoadError, setInvitationLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(search).get('perfil') || '');
  const selectedIdRef = useRef('');
  selectedIdRef.current = selectedId;
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [inlineAssignByEmail, setInlineAssignByEmail] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountState, setAccountState] = useState<'all' | 'active' | 'blocked' | 'unassigned' | 'with_personnel' | 'without_personnel'>('all');
  const [profileFilterId, setProfileFilterId] = useState('all');
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
    const [profileResult, permissionResult, memberResult, googleResult, invitationResult, personnelResult] = await Promise.all([
      supabase.from('access_profiles').select('id,profile_key,name,description,base_role,is_system,active').eq('organization_id', organizationId).order('name'),
      supabase.from('access_profile_permissions').select('profile_id,module_key,action_key,enabled'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.rpc('list_visualcorp_team_accounts_with_avatars'),
      supabase.rpc('list_organization_access_invitations', { p_organization_id: organizationId }),
      supabase.from('personnel_records').select('id,full_name,position_title,department,employment_status,google_account_email,membership_id').eq('organization_id', organizationId),
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
    const loadedPermRows = permissionResult.data || [];
    const chosen = preferredId || selectedIdRef.current || profileResult.data?.find((profile: any) => profile.profile_key !== 'owner')?.id || '';
    setSelectedId(chosen);
    const selected = profileResult.data?.find((profile: any) => profile.id === chosen);
    if (selected) {
      setProfileName(selected.name);
      setProfileDescription(selected.description || '');
      setProfileKey(selected.profile_key);
      setMatrix(
        Object.fromEntries(
          loadedPermRows.filter((row: any) => row.profile_id === chosen).map((row: any) => [`${row.module_key}.${row.action_key}`, row.enabled]),
        ),
      );
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    usuarios: 'Administra las cuentas del equipo, sus perfiles de acceso, su vínculo con fichas laborales y las políticas operativas activas.',
    perfiles: 'Organiza funciones del equipo mediante perfiles claros o plantillas rápidas por área operativa.',
    permisos: 'Configura la matriz de permisos por módulo y las reglas críticas de descuentos comerciales, precios, devoluciones y nómina.',
  };
  const profileQuery = selectedId && section !== 'usuarios' ? `?perfil=${encodeURIComponent(selectedId)}` : '';
  const teamPage = (page: 'usuarios' | 'perfiles' | 'permisos') => `/operaciones/equipo/${page}${page === 'usuarios' ? '' : profileQuery}`;

  // Map profile permissions for quick lookup on user cards and profile cards
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

  const personnelByEmailOrMembership = useMemo(() => {
    const byEmail = new Map<string, any>();
    const byMembership = new Map<string, any>();
    for (const rec of personnelRecords) {
      if (rec.google_account_email) {
        byEmail.set(String(rec.google_account_email).toLowerCase().trim(), rec);
      }
      if (rec.membership_id) {
        byMembership.set(String(rec.membership_id), rec);
      }
    }
    return { byEmail, byMembership };
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
          personnelByEmailOrMembership.byEmail.get(emailLower) ||
          account.memberships.map((m: any) => personnelByEmailOrMembership.byMembership.get(String(m.id))).find(Boolean) ||
          null;
        const effectivePerms = new Set<string>();
        const isOwner = account.memberships.some((m: any) => m.active && m.role === 'owner');
        for (const m of account.memberships) {
          if (!m.active) continue;
          const pSet = permissionsByProfileId.get(m.access_profile_id);
          if (pSet) {
            pSet.forEach((perm) => effectivePerms.add(perm));
          }
        }
        return {
          ...account,
          linkedPersonnel,
          isOwner,
          effectivePerms,
        };
      })
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'es'));
  }, [memberAccounts, googleAccounts, personnelByEmailOrMembership, permissionsByProfileId]);

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
      if (!member.access_profile_id) continue;
      const prev = counts.get(member.access_profile_id) || { total: 0, active: 0 };
      prev.total += 1;
      if (member.active) prev.active += 1;
      counts.set(member.access_profile_id, prev);
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
      if (profileFilterId !== 'all' && !account.memberships.some((m: any) => m.access_profile_id === profileFilterId)) {
        return false;
      }
      const haystack = `${account.full_name} ${account.email} ${account.linkedPersonnel?.full_name || ''} ${account.linkedPersonnel?.position_title || ''} ${account.memberships
        .map((membership: any) => membership.access_profiles?.name || roleNames[membership.role] || membership.role)
        .join(' ')}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');
      return !query || haystack.includes(query);
    });
  }, [accountDirectory, accountQuery, accountState, profileFilterId]);

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
      setMatrix({});
      return;
    }
    setProfileName(selected.name);
    setProfileDescription(selected.description || '');
    setProfileKey(selected.profile_key);
    setMatrix(
      Object.fromEntries(
        permissionRows.filter((row) => row.profile_id === id).map((row) => [`${row.module_key}.${row.action_key}`, row.enabled]),
      ),
    );
  };

  const setPermission = (key: string, enabled: boolean) =>
    setMatrix((current) => {
      const next = { ...current, [key]: enabled };
      const [moduleKey, actionKey] = key.split('.');
      if (actionKey === 'edit' && enabled) next[`${moduleKey}.view`] = true;
      if (actionKey === 'view' && !enabled) next[`${moduleKey}.edit`] = false;
      if (moduleKey === 'personnel' && actionKey === 'view' && !enabled) {
        next['personnel.view_compensation'] = false;
        next['personnel.edit_compensation'] = false;
      }
      if (moduleKey === 'personnel' && actionKey === 'view_compensation' && enabled) next['personnel.view'] = true;
      if (moduleKey === 'finance' && actionKey === 'manage_finance' && enabled) next['finance.view'] = true;
      if (moduleKey === 'finance' && actionKey === 'view' && !enabled) next['finance.manage_finance'] = false;
      if (moduleKey === 'personnel' && actionKey === 'view_compensation' && !enabled) next['personnel.edit_compensation'] = false;
      if (moduleKey === 'personnel' && actionKey === 'edit_compensation' && enabled) {
        next['personnel.view'] = true;
        next['personnel.edit'] = true;
        next['personnel.view_compensation'] = true;
      }
      if (moduleKey === 'personnel' && actionKey === 'edit' && !enabled) next['personnel.edit_compensation'] = false;
      return next;
    });

  const applyRolePreset = (preset: RolePreset) => {
    if (!canManageProfiles) return;
    const nextMatrix: Record<string, boolean> = {};
    for (const permKey of preset.permissions) {
      nextMatrix[permKey] = true;
    }
    setMatrix(nextMatrix);
    if (!selectedId) {
      setProfileName(preset.name);
      setProfileKey(preset.keySuggestion);
      setProfileDescription(preset.description);
    } else if (!profileDescription.trim()) {
      setProfileDescription(preset.description);
    }
    setMessage(`Plantilla "${preset.name}" aplicada en la matriz. Guarda el perfil para confirmar los cambios.`);
    setError('');
  };

  const applyBulkMatrixAction = (mode: 'all_view' | 'all_edit' | 'clear_all') => {
    if (!canManageProfiles) return;
    if (mode === 'clear_all') {
      setMatrix({});
      return;
    }
    setMatrix((current) => {
      const next = { ...current };
      for (const [moduleKey] of modules) {
        next[`${moduleKey}.view`] = true;
        if (mode === 'all_edit') {
          next[`${moduleKey}.edit`] = true;
        }
      }
      return next;
    });
  };

  const toggleModuleRowAll = (moduleKey: string, enable: boolean) => {
    if (!canManageProfiles) return;
    setMatrix((current) => {
      const next = { ...current };
      next[`${moduleKey}.view`] = enable;
      next[`${moduleKey}.edit`] = enable;
      if (!enable) {
        next[`${moduleKey}.delete_records`] = false;
      }
      return next;
    });
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageProfiles || saving) return;
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
        enabled: Boolean(matrix[`${module}.delete_records`]),
      })),
    ];
    try {
      const { data, error: saveError } = await supabase.rpc('save_visualcorp_access_profile', {
        p_profile_id: selectedId || null,
        p_key: profileKey,
        p_name: profileName,
        p_description: profileDescription,
        p_permissions: entries,
      });
      if (saveError) throw saveError;
      setSelectedId(data);
      await load(data);
      setMessage('Perfil guardado. Los permisos se aplican desde la base de datos.');
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
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', {
        p_organization_id: organizationId,
        p_email: email.trim(),
        p_profile_id: assignProfileId,
      });
      if (assignError) throw assignError;
      setEmail('');
      await load();
      setMessage(
        data?.status === 'assigned'
          ? `Acceso asignado a ${data.email}. Los permisos se actualizarán en su sesión.`
          : `Invitación creada para ${data?.email || email.trim()}. Vence el ${
              data?.expires_at ? new Date(data.expires_at).toLocaleDateString('es-EC') : 'en 7 días'
            }. Comunica el acceso por un canal verificado; la aplicación no envía correos.`,
      );
    } catch (assignError: any) {
      setError(assignError.message || 'No se pudo asignar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const assignInlineProfileToAccount = async (accountEmail: string, profileIdToAssign: string) => {
    if (!canManageMembers || saving || !accountEmail || !profileIdToAssign) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', {
        p_organization_id: organizationId,
        p_email: accountEmail.trim(),
        p_profile_id: profileIdToAssign,
      });
      if (assignError) throw assignError;
      setInlineAssignByEmail((prev) => ({ ...prev, [accountEmail]: '' }));
      await load();
      const assignedProfileName = profiles.find((p) => p.id === profileIdToAssign)?.name || 'perfil seleccionado';
      setMessage(
        data?.status === 'assigned'
          ? `Perfil "${assignedProfileName}" asignado a ${accountEmail}.`
          : `Invitación de perfil "${assignedProfileName}" registrada para ${accountEmail}.`,
      );
      await refreshAccess();
    } catch (assignError: any) {
      setError(assignError.message || 'No se pudo asignar el perfil a la cuenta.');
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
    if (!canManageMembers || saving || account.memberships.some((membership: any) => membership.role === 'owner')) return;
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
    if (!canManageMembers || saving || !account.memberships.length || account.memberships.some((membership: any) => membership.role === 'owner'))
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
    if (!selectedProfile || !canManageProfiles || saving || selectedProfile.profile_key === 'owner') return;
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
  const assignableProfiles = profiles.filter(
    (profile) => profile.active && profile.profile_key !== 'owner' && (roles.includes('owner') || !['admin', 'website_admin'].includes(profile.profile_key)),
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
            <small>Cuentas, roles y fichas</small>
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
              <div className="team-metrics team-metrics-5" aria-label="Resumen ejecutivo de usuarios y gobernanza">
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
                      <Search size={16} />
                      <span className="sr-only">Buscar usuarios por nombre, correo, cargo o perfil</span>
                      <input
                        type="search"
                        value={accountQuery}
                        onChange={(event) => setAccountQuery(event.target.value)}
                        placeholder="Buscar por nombre, correo, cargo o perfil…"
                      />
                    </label>
                    <label className="team-account-state">
                      <span className="sr-only">Filtrar por perfil</span>
                      <select value={profileFilterId} onChange={(event) => setProfileFilterId(event.target.value)}>
                        <option value="all">Todos los perfiles</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="team-account-state">
                      <span className="sr-only">Filtrar usuarios por estado</span>
                      <select value={accountState} onChange={(event) => setAccountState(event.target.value as typeof accountState)}>
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
                      <span>Prueba con otro nombre, correo, perfil o estado.</span>
                    </div>
                  ) : (
                    <div className="team-access-list">
                      {filteredAccounts.map((account) => {
                        const accountActive = account.memberships.some((membership: any) => membership.active);
                        const protectedOwner = account.memberships.some((membership: any) => membership.role === 'owner');
                        const avatarUrl = account.googleAccount?.avatar_url;
                        const linkedWorker = account.linkedPersonnel;
                        const canSellPos = account.isOwner || account.effectivePerms.has('sales.edit');
                        const canSettleRefund = account.isOwner || account.effectivePerms.has('cash.settle_refund');
                        const canManageSalaries = account.isOwner || account.effectivePerms.has('personnel.edit_compensation');
                        const canEditPrices = account.isOwner || account.effectivePerms.has('catalog_admin.edit_prices');
                        const assignedProfileIds = new Set(account.memberships.map((m: any) => m.access_profile_id));
                        const availableProfilesForUser = assignableProfiles.filter((p) => !assignedProfileIds.has(p.id));
                        const inlineSelectedProfile = inlineAssignByEmail[account.email] || '';

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
                                      {linkedWorker.position_title ? ` · ${linkedWorker.position_title}` : ''}
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
                                {account.memberships.map((member: any) => (
                                  <div className={'team-account-profile ' + (member.active ? '' : 'inactive')} key={member.id}>
                                    <span>
                                      <b>{member.access_profiles?.name || roleNames[member.role] || member.role}</b>
                                      <small>{member.active ? 'Activo' : 'Pausado'}</small>
                                    </span>
                                    <div className="team-member-chip-actions">
                                      {member.access_profile_id && (
                                        <Link
                                          className="team-profile-inspect-link"
                                          to={`/operaciones/equipo/permisos?perfil=${encodeURIComponent(member.access_profile_id)}`}
                                          title="Ver permisos de este perfil"
                                        >
                                          Permisos
                                        </Link>
                                      )}
                                      {canManageMembers && member.role !== 'owner' && (
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
                                ))}
                              </div>
                            ) : (
                              <p className="team-account-unassigned">La cuenta ya inició sesión, pero todavía no tiene perfiles asignados.</p>
                            )}

                            <div className="team-account-actions">
                              {canManageMembers && account.email && availableProfilesForUser.length > 0 && (
                                <div className="team-inline-assign">
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
                                  {inlineSelectedProfile && (
                                    <button
                                      type="button"
                                      className="button button-dark team-inline-assign-btn"
                                      disabled={saving}
                                      onClick={() => void assignInlineProfileToAccount(account.email, inlineSelectedProfile)}
                                    >
                                      <Plus size={13} /> Asignar
                                    </button>
                                  )}
                                </div>
                              )}
                              {canManageMembers && !protectedOwner && account.memberships.length > 0 && (
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
                  <section className="panel team-invite-panel" aria-labelledby="team-invite-title">
                    <header className="team-panel-heading">
                      <div>
                        <span className="eyebrow">NUEVO ACCESO</span>
                        <h2 id="team-invite-title">Asignar o invitar por correo</h2>
                        <p>Agrega una cuenta Google al espacio y asígnale su perfil inicial.</p>
                      </div>
                      <span className="team-panel-mark is-accent">
                        <UserPlus size={18} />
                      </span>
                    </header>
                    {canManageMembers ? (
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
                          Perfil de acceso
                          <select required value={assignProfileId} onChange={(event) => setAssignProfileId(event.target.value)}>
                            <option value="">Selecciona un perfil</option>
                            {assignableProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="team-access-help">
                          Si la cuenta todavía no existe o no está verificada, se creará una invitación por 7 días. La aplicación no envía el correo: comunica el acceso por un canal seguro.
                        </p>
                        <button className="button button-dark team-invite-submit" type="submit" disabled={saving || !assignProfileId}>
                          <UserPlus size={15} />
                          {saving ? 'Guardando…' : 'Asignar o invitar'}
                        </button>
                      </form>
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
                        <p className="team-access-help team-empty-invitations">No hay invitaciones pendientes.</p>
                      ) : (
                        <ul className="team-invitation-list">
                          {invitations.map((invitation) => (
                            <li className="team-invitation" key={invitation.id}>
                              <span>
                                <b>{invitation.invited_email}</b>
                                <small>
                                  {invitation.profile_name} · vence {new Date(invitation.expires_at).toLocaleDateString('es-EC')}
                                </small>
                              </span>
                              <button
                                className="team-invitation-revoke"
                                type="button"
                                disabled={saving}
                                onClick={() => void revokeInvitation(invitation)}
                              >
                                Cancelar
                              </button>
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
                        <h2>Descuentos y Salarios</h2>
                      </div>
                      <span className="team-panel-mark">
                        <Percent size={17} />
                      </span>
                    </header>
                    <ul className="team-governance-list">
                      <li>
                        <b>Descuento comercial POS:</b> Tope automático del <b>40%</b> sobre el subtotal y motivo obligatorio auditado en la venta.
                      </li>
                      <li>
                        <b>Descuentos de nómina (Personal):</b> Los anticipos, préstamos o deducciones al trabajador se registran en{' '}
                        <Link to="/operaciones/personal">Personal → Salarios y Descuentos</Link>.
                      </li>
                      <li>
                        <b>Liquidación de devoluciones:</b> Requiere el permiso especial <code>Liquidar devoluciones en caja</code>.
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
                    <p>Elige un perfil para revisar sus usuarios, alcance y permisos.</p>
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
                              <em>{memberStats.active} usuarios activos</em>
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
                        ? 'Define el nombre, la descripción o aplica una plantilla rápida de funciones operativas.'
                        : 'Empieza con un nombre claro o selecciona una plantilla rápida de rol para preconfigurar sus permisos.'}
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
                    <span>
                      <b>{memberCountByProfileId.get(selectedProfile.id)?.active || 0}</b> cuentas activas con este perfil ·{' '}
                      <b>{activeMatrixSummary.viewCount}</b> módulos con consulta · <b>{activeMatrixSummary.editCount}</b> con edición ·{' '}
                      <b>{activeMatrixSummary.specialCount}</b> permisos especiales.
                    </span>
                  </div>
                )}

                {canManageProfiles && (
                  <div className="team-role-presets" aria-label="Plantillas rápidas de rol">
                    <div className="team-role-presets-head">
                      <span>
                        <Sparkles size={14} /> <b>Plantillas rápidas de rol</b> — Precarga permisos recomendados en 1 clic
                      </span>
                    </div>
                    <div className="team-role-presets-grid">
                      {ROLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="team-role-preset-card"
                          onClick={() => applyRolePreset(preset)}
                        >
                          <span className="team-role-preset-badge">{preset.badge}</span>
                          <b>{preset.name}</b>
                          <small>{preset.description}</small>
                        </button>
                      ))}
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
                        disabled={!canManageProfiles}
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
                        disabled={!canManageProfiles || Boolean(selectedId)}
                        aria-describedby="team-profile-key-help"
                      />
                      <small id="team-profile-key-help">Solo minúsculas, números y guion bajo.</small>
                    </label>
                    <label className="team-profile-description">
                      Descripción operativa
                      <input
                        value={profileDescription}
                        onChange={(event) => setProfileDescription(event.target.value)}
                        maxLength={300}
                        disabled={!canManageProfiles}
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
                    {canManageProfiles && (
                      <button className="button button-dark" type="submit" disabled={saving}>
                        <Save size={15} />
                        {saving ? 'Guardando…' : 'Guardar perfil'}
                      </button>
                    )}
                    {selectedProfile && canManageProfiles && (
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={setProfileActive}
                        disabled={saving || (selectedProfile.profile_key === 'admin' && !roles.includes('owner'))}
                      >
                        <RotateCcw size={15} />
                        {selectedProfile.active ? 'Pausar perfil' : 'Reactivar perfil'}
                      </button>
                    )}
                    {!canManageProfiles && (
                      <p className="team-access-help">
                        Puedes consultar estos perfiles. La configuración está reservada a personas con permiso de gestión.
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
                      {canManageProfiles && (
                        <label className="team-gov-quick-check">
                          <input
                            type="checkbox"
                            checked={Boolean(matrix['sales.edit'])}
                            onChange={(e) => setPermission('sales.edit', e.target.checked)}
                          />
                          <span>Permitir emitir ventas y aplicar descuentos comerciales (≤40%)</span>
                        </label>
                      )}
                    </div>

                    <div className={`team-gov-box ${matrix['cash.settle_refund'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <BadgeDollarSign size={15} />
                        <b>Liquidación de Devoluciones en Caja</b>
                        <span className="team-gov-status">{matrix['cash.settle_refund'] ? 'Autorizado' : 'Restringido'}</span>
                      </div>
                      <p>
                        Controla quién puede ejecutar devoluciones de dinero en efectivo o transferencia y saldar notas de crédito en sesiones de caja.
                      </p>
                      {canManageProfiles && (
                        <label className="team-gov-quick-check">
                          <input
                            type="checkbox"
                            checked={Boolean(matrix['cash.settle_refund'])}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPermission('cash.view', true);
                                setPermission('cash.edit', true);
                              }
                              setPermission('cash.settle_refund', e.target.checked);
                            }}
                          />
                          <span>Autorizar liquidación de devoluciones en caja</span>
                        </label>
                      )}
                    </div>

                    <div className={`team-gov-box ${matrix['catalog_admin.edit_prices'] || matrix['inventory_costs.view_cost'] ? 'is-enabled' : ''}`}>
                      <div className="team-gov-box-head">
                        <KeyRound size={15} />
                        <b>Tarifas de Catálogo y Costos</b>
                        <span className="team-gov-status">
                          {matrix['catalog_admin.edit_prices'] ? 'Edita precios' : matrix['inventory_costs.view_cost'] ? 'Ve costos' : 'Protegido'}
                        </span>
                      </div>
                      <p>
                        Separa la consulta del catálogo de la edición de precios base (Normal, Instalación, Corporativo) y del costo confidencial de inventario.
                      </p>
                      {canManageProfiles && (
                        <div className="team-gov-dual-checks">
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['catalog_admin.edit_prices'])}
                              onChange={(e) => {
                                if (e.target.checked) setPermission('catalog_admin.view', true);
                                setPermission('catalog_admin.edit_prices', e.target.checked);
                              }}
                            />
                            <span>Editar precios del catálogo</span>
                          </label>
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['inventory_costs.view_cost'])}
                              onChange={(e) => {
                                if (e.target.checked) setPermission('inventory_costs.view', true);
                                setPermission('inventory_costs.view_cost', e.target.checked);
                              }}
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
                      {canManageProfiles && (
                        <div className="team-gov-dual-checks">
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['personnel.view_compensation'])}
                              onChange={(e) => setPermission('personnel.view_compensation', e.target.checked)}
                            />
                            <span>Ver salarios y descuentos</span>
                          </label>
                          <label className="team-gov-quick-check">
                            <input
                              type="checkbox"
                              checked={Boolean(matrix['personnel.edit_compensation'])}
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
                    {canManageProfiles && (
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

                  <div className="team-matrix-wrap">
                    <table className="team-permission-matrix">
                      <caption className="sr-only">Permisos de consulta, edición y eliminación por módulo</caption>
                      <thead>
                        <tr>
                          <th scope="col">Módulo</th>
                          <th scope="col">Consultar</th>
                          <th scope="col">Editar</th>
                          <th scope="col">Eliminar</th>
                          {canManageProfiles && <th scope="col">Fila rápida</th>}
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
                                        !canManageProfiles ||
                                        (key === 'personnel' && action === 'delete_records') ||
                                        (action === 'delete_records' && selectedProfile.profile_key === 'admin')
                                      }
                                      onChange={(event) => setPermission(`${key}.${action}`, event.target.checked)}
                                    />
                                    <span aria-hidden="true" />
                                  </label>
                                </td>
                              ))}
                              {canManageProfiles && (
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
                            disabled={!canManageProfiles}
                            onChange={(event) => setPermission(`${module}.${action}`, event.target.checked)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </details>

                  <div className="team-profile-actions">
                    {canManageProfiles && (
                      <button className="button button-dark" type="submit" disabled={saving}>
                        <Save size={15} />
                        {saving ? 'Guardando…' : 'Guardar permisos'}
                      </button>
                    )}
                    {!canManageProfiles && (
                      <p className="team-access-help">
                        Puedes consultar la matriz. Cambiar permisos requiere autorización de gestión de perfiles.
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
          <p>Los permisos se verifican en Supabase. El perfil Propietario permanece reservado.</p>
        </div>
      </aside>
    </div>
  );
}
