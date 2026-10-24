import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RotateCcw, Save, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './team-access.css';

const modules = [
  ['dashboard','Panel principal'],['website','Página web'],['crm','CRM y clientes'],['sales','Ventas y POS'],['quotes','Cotizaciones'],
  ['inventory','Inventario'],['inventory_costs','Costos de inventario'],['purchases','Compras'],['workshop','Taller y producción'],
  ['marketing','Marketing'],['team','Equipo'],['catalog_admin','Catálogo y tarifas'],['backup','Respaldo'],['cash','Caja'],['personnel','Personal'],
] as const;
const specialActions = [
  { module: 'team', action: 'manage_members', label: 'Asignar perfiles y activar o pausar accesos' },
  { module: 'team', action: 'manage_profiles', label: 'Crear y configurar perfiles' },
  { module: 'inventory_costs', action: 'view_costs', label: 'Ver costos y márgenes' },
  { module: 'inventory_costs', action: 'edit_costs', label: 'Editar costos' },
  { module: 'catalog_admin', action: 'edit_prices', label: 'Cambiar precios y tarifas' },
  { module: 'purchases', action: 'approve_purchase', label: 'Aprobar órdenes de compra' },
  { module: 'purchases', action: 'cancel_purchase', label: 'Cancelar órdenes de compra' },
  { module: 'purchases', action: 'receive_purchase', label: 'Registrar recepción de compras' },
  { module: 'sales', action: 'settle_refund', label: 'Completar reembolsos' },
  { module: 'website', action: 'publish_content', label: 'Publicar cambios en la web' },
  { module: 'cash', action: 'manage_cash', label: 'Registrar movimientos y gestionar caja' },
  { module: 'personnel', action: 'view_compensation', label: 'Consultar remuneración e historial de pagos del personal' },
  { module: 'personnel', action: 'edit_compensation', label: 'Registrar cambios de remuneración del personal' },
];
const roleNames: Record<string, string> = { owner: 'Propietario', admin: 'Admin', manager: 'Gerencia', advisor: 'Asesoras', warehouse: 'Inventario', production: 'Taller', marketing: 'Marketing', website_admin: 'Admin página web' };

export function TeamAccess() {
  const { organizationId, roles, hasPermission, refreshAccess } = useAuth();
  const canManageProfiles = hasPermission('team','manage_profiles');
  const canManageMembers = hasPermission('team','manage_members');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [permissionRows, setPermissionRows] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [pendingAccounts, setPendingAccounts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const selectedIdRef = useRef('');
  selectedIdRef.current = selectedId;
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState('');
  const [assignProfileId, setAssignProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (preferredId?: string) => {
    if (!organizationId || !supabase) { setLoading(false); return; }
    setLoading(true); setError('');
    const [profileResult, permissionResult, memberResult, pendingResult] = await Promise.all([
      supabase.from('access_profiles').select('id,profile_key,name,description,base_role,is_system,active').eq('organization_id', organizationId).order('name'),
      supabase.from('access_profile_permissions').select('profile_id,module_key,action_key,enabled'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.rpc('list_visualcorp_login_candidates'),
    ]);
    const profileRows = profileResult.data || [];
    const membershipRows = memberResult.data || [];
    const firstError = profileResult.error || permissionResult.error || memberResult.error || pendingResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setProfiles(profileRows);
    setPermissionRows(permissionResult.data || []);
    setMembers(membershipRows.map((member) => ({ ...member, profiles: { full_name: member.full_name, email: member.email }, access_profiles: { name: member.access_profile_name, profile_key: member.access_profile_key } })));
    setPendingAccounts(pendingResult.data || []);
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
  const activeMembers = useMemo(() => members.filter((member) => member.active).length, [members]);
  const selectProfile = (id: string) => {
    setSelectedId(id);
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
  };
  const assign = async (event) => {
    event.preventDefault(); if (!canManageMembers || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { error: assignError } = await supabase.rpc('assign_visualcorp_profile', { p_email: email.trim(), p_profile_id: assignProfileId });
      if (assignError) throw assignError;
      setEmail(''); await load(); setMessage('Perfil asignado. La persona verá los permisos al actualizar su sesión.');
    } catch (assignError) { setError(assignError.message || 'No se pudo asignar el perfil.'); }
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

  return <div className="team-access">
    <div className="page-heading"><div><div className="eyebrow">USUARIOS Y PERMISOS</div><h1>Equipo Visual Corp</h1><p>Administra perfiles de trabajo, permisos por módulo y accesos de cada persona.</p></div><span className="local-badge"><Users size={14}/> {activeMembers} accesos activos</span></div>
    {error&&<p className="access-error" role="alert">{error}</p>}{message&&<p className="team-access-message" role="status">{message}</p>}
    {loading ? <section className="panel"><p>Cargando perfiles y accesos…</p></section> : <div className="team-access-grid">
      <section className="panel team-profiles-panel"><div className="panel-heading"><div><span className="eyebrow">PERFILES CONFIGURABLES</span><h2>Perfiles y permisos</h2></div><ShieldCheck size={19}/></div>
        <div className="team-profile-toolbar"><label>Perfil<select value={selectedId} onChange={(event)=>selectProfile(event.target.value)}><option value="">Nuevo perfil…</option>{profiles.filter((profile)=>profile.profile_key!=='owner').map((profile)=><option key={profile.id} value={profile.id}>{profile.name}{profile.active?'':' · Desactivado'}</option>)}</select></label>{canManageProfiles&&<button className="button button-outline" type="button" onClick={createProfile}>Crear perfil</button>}</div>
        {selectedId===''&&<p className="team-access-help">Configura un perfil nuevo. Empieza con todos los permisos desactivados y habilita solo lo que necesita el puesto.</p>}
        <form className="team-profile-form" onSubmit={saveProfile}>
          <div className="team-profile-fields"><label>Nombre<input value={profileName} onChange={(event)=>setProfileName(event.target.value)} required minLength={2} maxLength={80} disabled={!canManageProfiles}/></label><label>Identificador<input value={profileKey} onChange={(event)=>setProfileKey(event.target.value)} required pattern="[a-z0-9_]{2,48}" disabled={!canManageProfiles||Boolean(selectedId)}/></label><label className="team-profile-description">Descripción<input value={profileDescription} onChange={(event)=>setProfileDescription(event.target.value)} maxLength={300} disabled={!canManageProfiles}/></label></div>
          <div className="team-matrix-wrap"><table className="team-permission-matrix"><thead><tr><th>Módulo</th><th>Ver</th><th>Editar</th><th>Borrar</th></tr></thead><tbody>{modules.map(([key,label])=><tr key={key}><th scope="row">{label}</th>{(['view','edit','delete_records'] as const).map((action)=><td key={action}><input aria-label={`${label}: ${action==='view'?'ver':action==='edit'?'editar':'borrar registros'}`} type="checkbox" checked={Boolean(matrix[`${key}.${action}`])} disabled={!canManageProfiles||key==='personnel'&&action==='delete_records'||action==='delete_records'&&selectedProfile?.profile_key==='admin'} onChange={(event)=>setPermission(`${key}.${action}`,event.target.checked)}/></td>)}</tr>)}</tbody></table></div>
          <details className="team-advanced-permissions"><summary>Acciones especiales</summary><div className="team-special-grid">{specialActions.map(({module,action,label})=><label key={`${module}.${action}`}><input type="checkbox" checked={Boolean(matrix[`${module}.${action}`])} disabled={!canManageProfiles} onChange={(event)=>setPermission(`${module}.${action}`,event.target.checked)}/><span>{label}</span></label>)}</div></details>
          <div className="team-profile-actions">{canManageProfiles&&<button className="button button-dark" type="submit" disabled={saving}><Save size={15}/>{saving?'Guardando…':'Guardar perfil'}</button>}{selectedProfile&&canManageProfiles&&<button type="button" className="button button-outline" onClick={setProfileActive} disabled={saving||selectedProfile.profile_key==='admin'&&!roles.includes('owner')}><RotateCcw size={15}/>{selectedProfile.active?'Desactivar perfil':'Reactivar perfil'}</button>}</div>
          {!canManageProfiles&&<p className="team-access-help">Puedes consultar la matriz. La configuración está reservada a perfiles con ese permiso.</p>}
        </form>
      </section>
      <div className="team-access-side">
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESO DEL EQUIPO</span><h2>Asignar perfil</h2></div><UserPlus size={19}/></div>
          {canManageMembers?<form onSubmit={assign} className="team-access-form"><label>Correo de la cuenta<input required type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="persona@visualcorp.com"/></label><label>Perfil<select required value={assignProfileId} onChange={(event)=>setAssignProfileId(event.target.value)}><option value="">Selecciona un perfil</option>{profiles.filter((profile)=>profile.active&&profile.profile_key!=='owner'&&(roles.includes('owner')||!['admin','website_admin'].includes(profile.profile_key))).map((profile)=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><p className="team-access-help">Asigna un perfil a una cuenta ya registrada. Si la persona aún no aparece en la lista, debe iniciar sesión una vez con Google o correo. Puedes escribir su correo directamente o elegir una cuenta pendiente.</p><button className="button button-dark" type="submit" disabled={saving||!assignProfileId}><UserPlus size={15}/>{saving?'Guardando…':'Asignar acceso'}</button></form>:<p className="team-access-help">Puedes consultar los accesos del equipo.</p>}
          {canManageMembers&&<div className="pending-login-list"><div className="panel-heading"><div><span className="eyebrow">REGISTRO DE INGRESOS</span><h3>Cuentas sin perfil</h3></div><span className="muted-count">{pendingAccounts.length}</span></div>{pendingAccounts.length?pendingAccounts.map((account)=><button key={account.user_id} className="pending-login-row" type="button" onClick={()=>setEmail(account.email)}><span><b>{account.full_name||account.email}</b><small>{account.email} · Último ingreso {account.last_sign_in_at?new Date(account.last_sign_in_at).toLocaleString():'sin fecha'}</small></span><span>Asignar</span></button>):<p className="team-access-help">No hay cuentas pendientes de perfil.</p>}</div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CUENTAS REGISTRADAS</span><h2>Accesos</h2></div><span className="muted-count">{members.length} asignaciones</span></div>
          {members.length===0?<p className="team-access-help">No hay accesos visibles.</p>:<div className="team-access-list">{members.map((member)=><article className="activity-row" key={member.id}><span className="activity-avatar">{member.profiles?.full_name?.slice(0,1)||'V'}</span><span className="team-access-person"><b>{member.profiles?.full_name||member.profiles?.email||'Cuenta de equipo'}</b><small>{member.profiles?.email||member.user_id} · Último ingreso {member.last_sign_in_at?new Date(member.last_sign_in_at).toLocaleString():'sin fecha'}</small></span><span className={'team-access-role '+(member.active?'':'inactive')}>{member.access_profiles?.name||roleNames[member.role]||member.role}<small>{member.active?'Activo':'Pausado'}</small></span>{canManageMembers&&member.role!=='owner'&&<button type="button" className="button button-outline team-member-toggle" disabled={saving} onClick={()=>void setMemberActive(member)}>{member.active?'Pausar':'Reactivar'}</button>}</article>)}</div>}
        </section>
      </div>
    </div>}
    <div className="notice-box"><span><Check size={17}/></span><div><b>Los cambios se validan en Supabase</b><p>Ver, editar y las acciones especiales se comprueban también en la base central. El perfil Propietario queda reservado.</p></div></div>
  </div>;
}

