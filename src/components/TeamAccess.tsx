import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Ban, Check, IdCard, RotateCcw, Save, Search, ShieldCheck, UserPlus, UserRoundX, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './ui/Avatar';
import { supabase } from '../lib/supabaseClient';
import { legacyRoleNames, permissionModules, specialPermissionActions } from '../auth/accessCatalog';
import './team-access.css';

const modules = permissionModules;
const specialActions = specialPermissionActions;
const roleNames = legacyRoleNames;

export function TeamAccess() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { organizationId, roles, hasPermission, refreshAccess } = useAuth();
  const canManageProfiles = hasPermission('team','manage_profiles');
  const canManageMembers = hasPermission('team','manage_members');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<any[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountState, setAccountState] = useState<'all'|'active'|'blocked'>('all');

  const load = useCallback(async (preferredId?: string) => {
    if (!organizationId || !supabase) { setLoadFailed(true); setError('No se pudo establecer la conexión con la organización.'); setLoading(false); return; }
    setLoading(true); setLoadFailed(false); setError('');
    const [profileResult, permissionResult, memberResult, googleResult, invitationResult] = await Promise.all([
      supabase.from('access_profiles').select('id,profile_key,name,description,base_role,is_system,active').eq('organization_id', organizationId).order('name'),
      supabase.from('access_profile_permissions').select('profile_id,module_key,action_key,enabled'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.rpc('list_visualcorp_team_accounts_with_avatars'),
      supabase.rpc('list_organization_access_invitations', { p_organization_id: organizationId }),
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
    setMembers(membershipRows.map((member) => ({ ...member, profiles: { full_name: member.full_name, email: member.email }, access_profiles: { name: member.access_profile_name, profile_key: member.access_profile_key } })));
    setGoogleAccounts(googleResult.data || []);
    setInvitations(invitationResult.data || []);
    setInvitationLoadError(Boolean(invitationResult.error));
    const permissionRows = permissionResult.data || [];
    const chosen = preferredId || selectedIdRef.current || profileResult.data?.find((profile) => profile.profile_key !== 'owner')?.id || '';
    setSelectedId(chosen);
    const selected = profileResult.data?.find((profile) => profile.id === chosen);
    if (selected) {
      setProfileName(selected.name); setProfileDescription(selected.description || ''); setProfileKey(selected.profile_key);
      setMatrix(Object.fromEntries(permissionRows.filter((row) => row.profile_id === chosen).map((row) => [`${row.module_key}.${row.action_key}`,row.enabled])));
    }
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId);
  const lastPathPart = pathname.split('/').filter(Boolean).at(-1) || '';
  const section: 'usuarios'|'perfiles'|'permisos' = ['usuarios','perfiles','permisos'].includes(lastPathPart) ? lastPathPart as 'usuarios'|'perfiles'|'permisos' : 'usuarios';
  const sectionTitles = { usuarios: 'Usuarios', perfiles: 'Perfiles', permisos: 'Permisos' };
  const sectionDescriptions = {
    usuarios: 'Administra las cuentas que pueden ingresar y los perfiles que tienen asignados.',
    perfiles: 'Organiza permisos habituales en perfiles claros para cada función del equipo.',
    permisos: 'Revisa qué puede consultar, editar o administrar cada perfil.',
  };
  const profileQuery = selectedId && section !== 'usuarios' ? `?perfil=${encodeURIComponent(selectedId)}` : '';
  const teamPage = (page: 'usuarios'|'perfiles'|'permisos') => `/operaciones/equipo/${page}${page === 'usuarios' ? '' : profileQuery}`;
  const memberAccounts = useMemo(() => {
    const grouped = new Map<string, { user_id: string; full_name: string; email: string; last_sign_in_at: string | null; memberships: any[]; avatar_url?: string | null }>();
    for (const member of members) {
      const account = grouped.get(member.user_id) || { user_id: member.user_id, full_name: member.profiles?.full_name || '', email: member.profiles?.email || '', last_sign_in_at: member.last_sign_in_at, memberships: [] };
      account.memberships.push(member);
      grouped.set(member.user_id, account);
    }
    return [...grouped.values()].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'es'));
  }, [members]);
  const accountDirectory = useMemo(() => {
    const accounts = new Map(memberAccounts.map((account) => [account.user_id, { ...account, googleAccount: null as any }]));
    for (const googleAccount of googleAccounts) {
      const existing = accounts.get(googleAccount.user_id);
      accounts.set(googleAccount.user_id, existing ? { ...existing, googleAccount } : {
        user_id: googleAccount.user_id,
        full_name: googleAccount.full_name,
        email: googleAccount.email,
        last_sign_in_at: googleAccount.last_sign_in_at,
        memberships: [],
        googleAccount,
      });
    }
    return [...accounts.values()].sort((a,b)=>(a.full_name||a.email).localeCompare(b.full_name||b.email,'es'));
  }, [memberAccounts, googleAccounts]);
  const activeMembers = useMemo(() => memberAccounts.filter((account) => account.memberships.some((membership) => membership.active)).length, [memberAccounts]);
  const filteredAccounts = useMemo(() => {
    const query = accountQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    return accountDirectory.filter((account) => {
      const active = account.memberships.some((membership) => membership.active);
      if (accountState === 'active' && !active) return false;
      if (accountState === 'blocked' && (active || !account.memberships.length)) return false;
      const haystack = `${account.full_name} ${account.email} ${account.memberships.map((membership) => membership.access_profiles?.name || roleNames[membership.role] || membership.role).join(' ')}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      return !query || haystack.includes(query);
    });
  }, [accountDirectory, accountQuery, accountState]);
  const selectProfile = (id: string) => {
    setSelectedId(id);
    navigate({ pathname, search: id ? `?perfil=${encodeURIComponent(id)}` : '' }, { replace: true });
    setMessage(''); setError('');
    const selected = profiles.find((profile) => profile.id === id);
    if (!selected) {
      setProfileName(''); setProfileDescription(''); setProfileKey('nuevo_perfil'); setMatrix({});
      return;
    }
    setProfileName(selected.name);
    setProfileDescription(selected.description || '');
    setProfileKey(selected.profile_key);
    setMatrix(Object.fromEntries(permissionRows.filter((row) => row.profile_id === id).map((row) => [`${row.module_key}.${row.action_key}`, row.enabled])));
  };
  const setPermission = (key: string, enabled: boolean) => setMatrix((current) => {
    const next = { ...current, [key]: enabled };
    const [moduleKey, actionKey] = key.split('.');
    if (actionKey === 'edit' && enabled) next[`${moduleKey}.view`] = true;
    if (actionKey === 'view' && !enabled) next[`${moduleKey}.edit`] = false;
    if (moduleKey === 'personnel' && actionKey === 'view' && !enabled) { next['personnel.view_compensation'] = false; next['personnel.edit_compensation'] = false; }
    if (moduleKey === 'personnel' && actionKey === 'view_compensation' && enabled) next['personnel.view'] = true;
    if (moduleKey === 'finance' && actionKey === 'manage_finance' && enabled) next['finance.view'] = true;
    if (moduleKey === 'finance' && actionKey === 'view' && !enabled) next['finance.manage_finance'] = false;
    if (moduleKey === 'personnel' && actionKey === 'view_compensation' && !enabled) next['personnel.edit_compensation'] = false;
    if (moduleKey === 'personnel' && actionKey === 'edit_compensation' && enabled) { next['personnel.view'] = true; next['personnel.edit'] = true; next['personnel.view_compensation'] = true; }
    if (moduleKey === 'personnel' && actionKey === 'edit' && !enabled) next['personnel.edit_compensation'] = false;
    return next;
  });

  const saveProfile = async (event) => {
    event.preventDefault(); if (!canManageProfiles || saving) return;
    setSaving(true); setMessage(''); setError('');
    const entries: Array<{ module_key: string; action_key: string; enabled: boolean }> = [...modules.flatMap(([module]) => [
      { module_key: module, action_key: 'view', enabled: Boolean(matrix[`${module}.view`]) },
      { module_key: module, action_key: 'edit', enabled: Boolean(matrix[`${module}.edit`]) },
    ]), ...specialActions.map(({module,action}) => ({ module_key: module, action_key: action, enabled: Boolean(matrix[`${module}.${action}`]) })), ...modules.map(([module]) => ({ module_key: module, action_key: 'delete_records', enabled: Boolean(matrix[`${module}.delete_records`]) }))];
    try {
      const { data, error: saveError } = await supabase.rpc('save_visualcorp_access_profile', { p_profile_id: selectedId || null, p_key: profileKey, p_name: profileName, p_description: profileDescription, p_permissions: entries });
      if (saveError) throw saveError;
      setSelectedId(data); await load(data); setMessage('Perfil guardado. Los permisos se aplican desde la base de datos.'); await refreshAccess();
    } catch (saveError) { setError(saveError.message || 'No se pudo guardar el perfil.'); }
    finally { setSaving(false); }
  };

  const createProfile = () => {
    setSelectedId(''); setProfileName(''); setProfileDescription(''); setProfileKey('nuevo_perfil'); setMatrix({}); setMessage(''); setError('');
    navigate({ pathname, search: '' }, { replace: true });
  };
  const assign = async (event) => {
    event.preventDefault(); if (!canManageMembers || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', { p_organization_id: organizationId, p_email: email.trim(), p_profile_id: assignProfileId });
      if (assignError) throw assignError;
      setEmail(''); await load();
      setMessage(data?.status === 'assigned'
        ? `Acceso asignado a ${data.email}. Los permisos se actualizarán en su sesión.`
        : `Invitación creada para ${data?.email || email.trim()}. Vence el ${data?.expires_at ? new Date(data.expires_at).toLocaleDateString('es-EC') : 'en 7 días'}. Comunica el acceso por un canal verificado; la aplicación no envía correos.`);
    } catch (assignError) { setError(assignError.message || 'No se pudo asignar el perfil.'); }
    finally { setSaving(false); }
  };
  const revokeInvitation = async (invitation) => {
    if (!canManageMembers || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { error: revokeError } = await supabase.rpc('revoke_organization_access_invitation', { p_invitation_id: invitation.id });
      if (revokeError) throw revokeError;
      await load(); setMessage(`Invitación cancelada para ${invitation.invited_email}.`);
    } catch (revokeError) { setError(revokeError.message || 'No se pudo cancelar la invitación.'); }
    finally { setSaving(false); }
  };
  const setMemberActive = async (member) => {
    if (!canManageMembers || member.role === 'owner' || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { error: stateError } = await supabase.rpc('set_visualcorp_membership_active', { p_membership_id: member.id, p_active: !member.active });
      if (stateError) throw stateError;
      await load(); setMessage(member.active ? 'Acceso pausado.' : 'Acceso reactivado.');
    } catch (stateError) { setError(stateError.message || 'No se pudo actualizar el acceso.'); }
    finally { setSaving(false); }
  };
  const setAccountAccessActive = async (account, active: boolean) => {
    if (!canManageMembers || saving || account.memberships.some((membership) => membership.role === 'owner')) return;
    if (!active && !window.confirm(`¿Bloquear a ${account.full_name || account.email} en Visual Corp?\n\nSe pausarán todos sus perfiles de acceso. Su cuenta Google y su historial se conservarán, y un administrador podrá reactivar el acceso.`)) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { data, error: stateError } = await supabase.rpc('set_visualcorp_user_access_active', { p_user_id: account.user_id, p_active: active });
      if (stateError) throw stateError;
      await load();
      setMessage(data ? (active ? `Acceso reactivado en ${data} perfil${data === 1 ? '' : 'es'}.` : `Acceso bloqueado en ${data} perfil${data === 1 ? '' : 'es'}.`) : 'La cuenta ya estaba en ese estado.');
      await refreshAccess();
    } catch (stateError) { setError(stateError.message || 'No se pudo actualizar el acceso de la cuenta.'); }
    finally { setSaving(false); }
  };
  const removeAccountAccess = async (account) => {
    if (!canManageMembers || saving || !account.memberships.length || account.memberships.some((membership) => membership.role === 'owner')) return;
    if (!window.confirm(`¿Quitar a ${account.full_name || account.email} de Visual Corp?\n\nSe eliminarán sus perfiles asignados y perderá el acceso al espacio. La cuenta Google seguirá existiendo y el historial de ventas, producción y otras operaciones se conservará. Luego podrás volver a asignarle un perfil.`)) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { data, error: removeError } = await supabase.rpc('remove_visualcorp_user_access', { p_user_id: account.user_id });
      if (removeError) throw removeError;
      await load();
      setMessage(`Cuenta retirada de Visual Corp. Se conservaron sus registros históricos; se quitaron ${data} perfil${data === 1 ? '' : 'es'}.`);
      await refreshAccess();
    } catch (removeError) { setError(removeError.message || 'No se pudo retirar la cuenta del equipo.'); }
    finally { setSaving(false); }
  };
  const setProfileActive = async () => {
    if (!selectedProfile || !canManageProfiles || saving || selectedProfile.profile_key === 'owner') return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { error: stateError } = await supabase.rpc('set_visualcorp_profile_active', { p_profile_id: selectedProfile.id, p_active: !selectedProfile.active });
      if (stateError) throw stateError;
      await load(); setMessage(selectedProfile.active ? 'Perfil desactivado. Las cuentas asignadas conservaron su registro y ya no pueden usarlo.' : 'Perfil reactivado.');
      await refreshAccess();
    } catch (stateError) { setError(stateError.message || 'No se pudo actualizar el perfil.'); }
    finally { setSaving(false); }
  };

  const visibleProfiles = profiles.filter((profile) => profile.profile_key !== 'owner');
  const assignedAccounts = accountDirectory.filter((account) => account.memberships.length > 0).length;

  if (pathname.startsWith('/operaciones/equipo/') && !['usuarios','perfiles','permisos'].includes(lastPathPart)) {
    return <Navigate to="/operaciones/equipo/usuarios" replace/>;
  }

  return <div className={`team-access team-access-section-${section}`}>
    <header className="team-page-heading">
      <div><div className="eyebrow">ADMINISTRACIÓN · EQUIPO</div><h1>{sectionTitles[section]}</h1><p>{sectionDescriptions[section]}</p></div>
      {!loading&&!loadFailed&&<span className="team-live-summary"><Users size={15}/><b>{activeMembers}</b><span>usuarios con acceso</span></span>}
    </header>

    <nav className="team-subpages" aria-label="Administración de usuarios y accesos">
      <Link className={section==='usuarios'?'active':''} aria-current={section==='usuarios'?'page':undefined} to={teamPage('usuarios')}>
        <span className="team-subpage-index">01</span><Users size={18}/><span className="team-subpage-copy"><b>Usuarios</b><small>Cuentas y accesos</small></span><span className="team-subpage-count">{loading||loadFailed?'—':accountDirectory.length}</span>
      </Link>
      <Link className={section==='perfiles'?'active':''} aria-current={section==='perfiles'?'page':undefined} to={teamPage('perfiles')}>
        <span className="team-subpage-index">02</span><IdCard size={18}/><span className="team-subpage-copy"><b>Perfiles</b><small>Funciones del equipo</small></span><span className="team-subpage-count">{loading||loadFailed?'—':visibleProfiles.length}</span>
      </Link>
      <Link className={section==='permisos'?'active':''} aria-current={section==='permisos'?'page':undefined} to={teamPage('permisos')}>
        <span className="team-subpage-index">03</span><ShieldCheck size={18}/><span className="team-subpage-copy"><b>Permisos</b><small>Acciones por perfil</small></span>
      </Link>
    </nav>

    {error&&<p className="access-error" role="alert">{error}</p>}
    {message&&<p className="team-access-message" role="status">{message}</p>}

    {loading ? <section className="panel team-loading" role="status"><span className="team-loading-mark"><Users size={18}/></span><p>Cargando usuarios, perfiles y permisos…</p></section> : loadFailed ? <section className="panel team-load-error" role="alert"><span className="team-empty-mark"><ShieldCheck size={20}/></span><div><b>No se pudieron cargar los datos del equipo</b><p>{error||'Comprueba la conexión e inténtalo de nuevo.'}</p></div><button className="button button-outline" type="button" onClick={()=>void load()}><RotateCcw size={15}/>Reintentar</button></section> : <>
      {section==='usuarios'&&<>
        <div className="team-metrics" aria-label="Resumen de usuarios">
          <div><span className="team-metric-icon"><Users size={17}/></span><span><b>{accountDirectory.length}</b><small>Cuentas registradas</small></span></div>
          <div><span className="team-metric-icon is-active"><ShieldCheck size={17}/></span><span><b>{activeMembers}</b><small>Con acceso activo</small></span></div>
          <div><span className="team-metric-icon is-pending"><UserPlus size={17}/></span><span><b>{invitationLoadError?'—':invitations.length}</b><small>{invitationLoadError?'Invitaciones no disponibles':'Invitaciones pendientes'}</small></span></div>
        </div>

        <div className="team-users-layout">
          <section className="panel team-users-panel" aria-labelledby="team-users-title">
            <header className="team-panel-heading"><div><span className="eyebrow">CUENTAS DEL ESPACIO</span><h2 id="team-users-title">Usuarios</h2><p>{assignedAccounts} de {accountDirectory.length} cuentas tienen perfiles asignados.</p></div><span className="team-panel-mark"><Users size={18}/></span></header>
            <div className="team-account-filters">
              <label className="team-account-search"><Search size={16}/><span className="sr-only">Buscar usuarios por nombre, correo o perfil</span><input type="search" value={accountQuery} onChange={(event)=>setAccountQuery(event.target.value)} placeholder="Buscar por nombre, correo o perfil"/></label>
              <label className="team-account-state"><span className="sr-only">Filtrar usuarios por acceso</span><select value={accountState} onChange={(event)=>setAccountState(event.target.value as typeof accountState)}><option value="all">Todos los estados</option><option value="active">Con acceso activo</option><option value="blocked">Acceso pausado</option></select></label>
              <span className="team-account-result-count" aria-live="polite">{filteredAccounts.length} de {accountDirectory.length}</span>
            </div>
            <p className="team-account-guidance">Pausar bloquea el acceso al espacio. Quitar de Visual Corp retira sus perfiles, conserva la cuenta Google y el historial del negocio.</p>
            {accountDirectory.length===0 ? <div className="team-account-empty"><span className="team-empty-mark"><Users size={20}/></span><b>Aún no hay usuarios registrados</b><span>Las cuentas aparecerán aquí cuando inicien sesión o reciban un perfil de acceso.</span></div> : filteredAccounts.length===0 ? <div className="team-account-empty"><span className="team-empty-mark"><Search size={20}/></span><b>No encontramos coincidencias</b><span>Prueba con otro nombre, correo, perfil o estado.</span></div> : <div className="team-access-list">
              {filteredAccounts.map((account)=>{
                const accountActive=account.memberships.some((membership)=>membership.active);
                const protectedOwner=account.memberships.some((membership)=>membership.role==='owner');
                const avatarUrl=account.googleAccount?.avatar_url;
                return <article className="team-account-row" key={account.user_id}>
                  <div className="team-account-header">
                    <Avatar name={account.full_name||account.email||'Cuenta de equipo'} src={avatarUrl} size="sm" className="activity-avatar" badge={avatarUrl?<span className="vc-google-avatar-mark">G</span>:undefined}/>
                    <span className="team-access-person"><b>{account.full_name||account.email||'Cuenta de equipo'}</b><small>{account.email||account.user_id}</small>{account.googleAccount&&<small className="team-account-google">Cuenta Google vinculada{account.googleAccount.linked_personnel_name?` · Ficha: ${account.googleAccount.linked_personnel_name}`:' · Sin ficha laboral vinculada'}</small>}</span>
                    <span className={'team-access-role '+(accountActive?'':'inactive')}><span className="team-status-dot" aria-hidden="true"/>{account.memberships.length?(accountActive?'Acceso activo':'Acceso pausado'):'Sin perfil asignado'}<small>{account.memberships.filter((membership)=>membership.active).length} de {account.memberships.length} perfiles activos</small></span>
                  </div>
                  {account.memberships.length>0 ? <div className="team-account-profiles" aria-label={`Perfiles de ${account.full_name||account.email||'la cuenta'}`}>{account.memberships.map((member)=><div className={'team-account-profile '+(member.active?'':'inactive')} key={member.id}><span><b>{member.access_profiles?.name||roleNames[member.role]||member.role}</b><small>{member.active?'Activo':'Pausado'}</small></span>{canManageMembers&&member.role!=='owner'&&<button type="button" className="button button-outline team-member-toggle" disabled={saving} onClick={()=>void setMemberActive(member)} aria-label={`${member.active?'Pausar':'Reactivar'} perfil ${member.access_profiles?.name||roleNames[member.role]||member.role} para ${account.full_name||account.email}`}>{member.active?'Pausar':'Reactivar'}</button>}</div>)}</div> : <p className="team-account-unassigned">La cuenta ya inició sesión, pero todavía no tiene perfiles asignados.</p>}
                  <div className="team-account-actions">{canManageMembers&&!protectedOwner&&account.memberships.length>0&&<><button type="button" className={accountActive?'team-account-block':'team-account-reactivate'} disabled={saving} onClick={()=>void setAccountAccessActive(account,!accountActive)}>{accountActive?<><Ban size={14}/>Pausar todos</>:<><RotateCcw size={14}/>Reactivar todos</>}</button><button type="button" className="team-account-remove" disabled={saving} onClick={()=>void removeAccountAccess(account)}><UserRoundX size={14}/>Quitar de Visual Corp</button></>}{protectedOwner&&<span className="team-account-protected"><ShieldCheck size={14}/> Cuenta protegida</span>}</div>
                </article>;
              })}
            </div>}
          </section>

          <aside className="team-access-side">
            <section className="panel team-invite-panel" aria-labelledby="team-invite-title">
              <header className="team-panel-heading"><div><span className="eyebrow">NUEVO ACCESO</span><h2 id="team-invite-title">Asignar un perfil</h2><p>Agrega una cuenta al espacio de trabajo.</p></div><span className="team-panel-mark is-accent"><UserPlus size={18}/></span></header>
              {canManageMembers ? <form onSubmit={assign} className="team-access-form"><label>Correo de la cuenta<input required type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="persona@visualcorp.com"/></label><label>Perfil de acceso<select required value={assignProfileId} onChange={(event)=>setAssignProfileId(event.target.value)}><option value="">Selecciona un perfil</option>{profiles.filter((profile)=>profile.active&&profile.profile_key!=='owner'&&(roles.includes('owner')||!['admin','website_admin'].includes(profile.profile_key))).map((profile)=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><p className="team-access-help">Si la cuenta todavía no existe o no está verificada, se creará una invitación por 7 días. La aplicación no envía el correo: comunica el acceso por un canal seguro.</p><button className="button button-dark team-invite-submit" type="submit" disabled={saving||!assignProfileId}><UserPlus size={15}/>{saving?'Guardando…':'Asignar o invitar'}</button></form> : <p className="team-access-help">Tu perfil permite consultar usuarios. Para asignar accesos, solicita el permiso a una persona administradora.</p>}
            </section>

            {canManageMembers&&<section className="panel team-invitations" aria-labelledby="team-invitations-title"><header className="team-panel-heading"><div><span className="eyebrow">PENDIENTES</span><h2 id="team-invitations-title">Invitaciones</h2></div><span className="team-invitation-count">{invitations.length}</span></header>{invitationLoadError?<p className="team-access-help" role="status">No se pudo consultar el estado de las invitaciones. Vuelve a intentarlo más tarde.</p>:invitations.length===0?<p className="team-access-help team-empty-invitations">No hay invitaciones pendientes.</p>:<ul className="team-invitation-list">{invitations.map((invitation)=><li className="team-invitation" key={invitation.id}><span><b>{invitation.invited_email}</b><small>{invitation.profile_name} · vence {new Date(invitation.expires_at).toLocaleDateString('es-EC')}</small></span><button className="team-invitation-revoke" type="button" disabled={saving} onClick={()=>void revokeInvitation(invitation)}>Cancelar</button></li>)}</ul>}</section>}
          </aside>
        </div>
      </>}

      {section==='perfiles'&&<div className="team-profiles-layout">
        <aside className="panel team-profile-directory" aria-labelledby="team-profile-directory-title">
          <header className="team-panel-heading"><div><span className="eyebrow">ROLES DEL EQUIPO</span><h2 id="team-profile-directory-title">Perfiles</h2><p>Elige un perfil para revisar sus datos.</p></div><span className="team-panel-mark"><IdCard size={18}/></span></header>
          {canManageProfiles&&<button className="button button-dark team-create-profile" type="button" onClick={createProfile}><Users size={15}/>Crear perfil</button>}
          {visibleProfiles.length===0?<div className="team-account-empty"><b>No hay perfiles configurables</b><span>Crea un perfil para definir un conjunto de permisos.</span></div>:<div className="team-profile-list" role="list">{visibleProfiles.map((profile)=><button type="button" role="listitem" key={profile.id} className={`team-profile-choice ${selectedId===profile.id?'active':''}`} aria-pressed={selectedId===profile.id} onClick={()=>selectProfile(profile.id)}><span className="team-profile-choice-icon"><IdCard size={17}/></span><span className="team-profile-choice-copy"><b>{profile.name}</b><small>{profile.description||'Sin descripción adicional'}</small></span><span className={`team-profile-state ${profile.active?'is-active':''}`}><i aria-hidden="true"/>{profile.active?'Activo':'Pausado'}</span></button>)}</div>}
        </aside>

        <section className="panel team-profile-editor" aria-labelledby="team-profile-editor-title">
          <header className="team-panel-heading"><div><span className="eyebrow">CONFIGURACIÓN DEL PERFIL</span><h2 id="team-profile-editor-title">{selectedProfile?.name||'Nuevo perfil'}</h2><p>{selectedProfile?'Define el nombre y la descripción que verá el equipo.':'Empieza con un nombre claro. Los permisos se configuran en la página Permisos.'}</p></div><span className="team-panel-mark is-accent"><IdCard size={18}/></span></header>
          {selectedProfile&&<div className="team-profile-current"><span className="team-profile-state is-active"><i aria-hidden="true"/>{selectedProfile.active?'Perfil activo':'Perfil pausado'}</span><span>Los accesos asignados se mantienen registrados.</span></div>}
          <form className="team-profile-form" onSubmit={saveProfile}>
            <div className="team-profile-fields"><label>Nombre del perfil<input value={profileName} onChange={(event)=>setProfileName(event.target.value)} required minLength={2} maxLength={80} disabled={!canManageProfiles} placeholder="Ej. Atención al cliente"/></label><label>Identificador interno<input value={profileKey} onChange={(event)=>setProfileKey(event.target.value)} required pattern="[a-z0-9_]{2,48}" disabled={!canManageProfiles||Boolean(selectedId)} aria-describedby="team-profile-key-help"/><small id="team-profile-key-help">Solo minúsculas, números y guion bajo.</small></label><label className="team-profile-description">Descripción<input value={profileDescription} onChange={(event)=>setProfileDescription(event.target.value)} maxLength={300} disabled={!canManageProfiles} placeholder="Qué tareas puede realizar este perfil"/></label></div>
            <div className="team-profile-edit-hint"><ShieldCheck size={16}/><p>Los accesos a módulos se administran aparte para que la identidad del perfil y sus permisos sean fáciles de revisar.</p><Link to={teamPage('permisos')}>Configurar permisos</Link></div>
            <div className="team-profile-actions">{canManageProfiles&&<button className="button button-dark" type="submit" disabled={saving}><Save size={15}/>{saving?'Guardando…':'Guardar perfil'}</button>}{selectedProfile&&canManageProfiles&&<button type="button" className="button button-outline" onClick={setProfileActive} disabled={saving||selectedProfile.profile_key==='admin'&&!roles.includes('owner')}><RotateCcw size={15}/>{selectedProfile.active?'Pausar perfil':'Reactivar perfil'}</button>}{!canManageProfiles&&<p className="team-access-help">Puedes consultar estos perfiles. La configuración está reservada a personas con permiso de gestión.</p>}</div>
          </form>
        </section>
      </div>}

      {section==='permisos'&&<section className="panel team-permissions-panel" aria-labelledby="team-permissions-title">
        <header className="team-panel-heading team-permissions-heading"><div><span className="eyebrow">CONTROL DE ACCESO</span><h2 id="team-permissions-title">Permisos por perfil</h2><p>Selecciona un perfil y revisa los accesos de cada módulo.</p></div><span className="team-panel-mark is-accent"><ShieldCheck size={18}/></span></header>
        <div className="team-permission-toolbar"><label>Perfil<select value={selectedId} onChange={(event)=>selectProfile(event.target.value)}><option value="">Selecciona un perfil</option>{visibleProfiles.map((profile)=><option key={profile.id} value={profile.id}>{profile.name}{profile.active?'':' · Pausado'}</option>)}</select></label>{selectedProfile&&<span className={`team-profile-state ${selectedProfile.active?'is-active':''}`}><i aria-hidden="true"/>{selectedProfile.name} · {selectedProfile.active?'Activo':'Pausado'}</span>}</div>
        {selectedProfile ? <form className="team-profile-form" onSubmit={saveProfile}>
          <p className="team-permissions-help">Activa solo lo que este perfil necesita. Permitir editar habilita también la consulta de ese módulo. El perfil Propietario está protegido.</p>
          <div className="team-matrix-wrap"><table className="team-permission-matrix"><caption className="sr-only">Permisos de consulta, edición y eliminación por módulo</caption><thead><tr><th scope="col">Módulo</th><th scope="col">Consultar</th><th scope="col">Editar</th><th scope="col">Eliminar</th></tr></thead><tbody>{modules.map(([key,label])=><tr key={key}><th scope="row">{label}</th>{(['view','edit','delete_records'] as const).map((action)=><td key={action}><label className="team-permission-toggle"><input aria-label={`${label}: ${action==='view'?'consultar':action==='edit'?'editar':'eliminar registros'}`} type="checkbox" checked={Boolean(matrix[`${key}.${action}`])} disabled={!canManageProfiles||key==='personnel'&&action==='delete_records'||action==='delete_records'&&selectedProfile.profile_key==='admin'} onChange={(event)=>setPermission(`${key}.${action}`,event.target.checked)}/><span aria-hidden="true"/></label></td>)}</tr>)}</tbody></table></div>
          <details className="team-advanced-permissions"><summary><span>Acciones especiales</span><small>Permisos concretos para funciones delicadas</small></summary><div className="team-special-grid">{specialActions.map(({module,action,label})=><label key={`${module}.${action}`}><input type="checkbox" checked={Boolean(matrix[`${module}.${action}`])} disabled={!canManageProfiles} onChange={(event)=>setPermission(`${module}.${action}`,event.target.checked)}/><span>{label}</span></label>)}</div></details>
          <div className="team-profile-actions">{canManageProfiles&&<button className="button button-dark" type="submit" disabled={saving}><Save size={15}/>{saving?'Guardando…':'Guardar permisos'}</button>}{!canManageProfiles&&<p className="team-access-help">Puedes consultar la matriz. Cambiar permisos requiere autorización de gestión de perfiles.</p>}</div>
        </form> : <div className="team-permissions-empty"><span className="team-empty-mark"><ShieldCheck size={20}/></span><b>Primero selecciona un perfil</b><span>La matriz aparecerá aquí para que puedas revisar sus accesos.</span><Link className="button button-outline" to={teamPage('perfiles')}>Ver perfiles</Link></div>}
      </section>}
    </>}

    <aside className="notice-box team-access-note"><span><Check size={17}/></span><div><b>La base central valida cada cambio</b><p>Los permisos se verifican en Supabase. El perfil Propietario permanece reservado.</p></div></aside>
  </div>;
}

