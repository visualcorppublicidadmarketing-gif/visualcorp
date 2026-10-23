import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './team-access.css';

const roleNames = { owner: 'Propietario', admin: 'Admin POS', website_admin: 'Admin página web', manager: 'Gerencia', advisor: 'Asesora', warehouse: 'Bodega', production: 'Producción', marketing: 'Marketing' };
const assignableRoles = ['admin', 'manager', 'advisor', 'warehouse', 'production', 'marketing'];

export function TeamAccess() {
  const { organizationId, roles } = useAuth();
  const canAssign = roles.includes('owner') || roles.includes('admin');
  const canAssignWebsite = roles.includes('owner');
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('advisor');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId || !supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from('organization_memberships')
      .select('user_id,role,active,created_at,profiles(full_name,email)')
      .eq('organization_id', organizationId).order('created_at');
    if (queryError) setError(queryError.message);
    else { setMembers(data || []); setError(''); }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (event) => {
    event.preventDefault();
    if (!canAssign || saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const { error: assignError } = await supabase.rpc('assign_visualcorp_role', { p_email: email.trim(), p_role: role });
      if (assignError) throw assignError;
      setEmail('');
      await load();
      setMessage('Perfil asignado. La persona podrá usarlo al iniciar sesión de nuevo.');
    } catch (assignError) {
      setError(assignError.message || 'No se pudo asignar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = members.filter((member) => member.active).length;

  return <div className="team-access">
    <div className="page-heading"><div><div className="eyebrow">USUARIOS Y PERMISOS</div><h1>Equipo Visual Corp</h1><p>Consulta los perfiles registrados y asigna acceso a personas que ya ingresaron por primera vez.</p></div><span className="local-badge"><Users size={14}/> {activeCount} accesos activos</span></div>
    <div className="dashboard-grid">
      <section className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">ACCESO DEL EQUIPO</span><h2>Asignar perfil</h2></div><UserPlus size={19}/></div>
        {canAssign ? <form onSubmit={assign} className="team-access-form">
          <label>Correo que ya inició sesión<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@visualcorp.com"/></label>
          <label>Panel y permisos<select value={role} onChange={(event) => setRole(event.target.value)}>{canAssignWebsite && <option value="website_admin">Admin página web</option>}{assignableRoles.map((value) => <option key={value} value={value}>{roleNames[value]}</option>)}</select></label>
          <p className="team-access-help">La asignación activa el perfil de una cuenta existente. Esta acción no envía una invitación por correo.</p>
          <button className="button button-dark" type="submit" disabled={saving}><ShieldCheck size={16}/> {saving ? 'Asignando…' : 'Asignar acceso'}</button>
        </form> : <p className="team-access-help">Puedes consultar los accesos. Solo el propietario o Admin POS puede asignar perfiles.</p>}
        {message && <p role="status" className="team-access-message">{message}</p>}{error && <p className="access-error" role="alert">{error}</p>}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">REGISTRO DE ACCESOS</span><h2>Roles y cuentas</h2></div><span className="muted-count">{members.length} asignaciones</span></div>
        {loading ? <p>Cargando perfiles…</p> : members.length === 0 ? <p className="team-access-help">No hay perfiles visibles para esta organización.</p> : <div className="team-access-list">{members.map((member, index) => <article className="activity-row" key={member.user_id + '-' + member.role + '-' + index}><span className="activity-avatar">{member.profiles?.full_name?.slice(0, 1) || 'V'}</span><span className="team-access-person"><b>{member.profiles?.full_name || member.profiles?.email || 'Cuenta de equipo'}</b><small>{member.profiles?.email || member.user_id}</small></span><span className={'team-access-role ' + (member.active ? '' : 'inactive')}>{roleNames[member.role] || member.role}<small>{member.active ? 'Activo' : 'Inactivo'}</small></span></article>)}</div>}
      </section>
    </div>
    <div className="notice-box"><span><ShieldCheck size={17}/></span><div><b>Los accesos se comprueban por perfil</b><p>La lista muestra las asignaciones registradas. Los cambios efectivos dependen de la sesión de cada persona y de los permisos de la base central.</p></div></div>
  </div>;
}
