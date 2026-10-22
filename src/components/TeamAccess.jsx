import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { formatDate } from '../app/workspace';

const roleNames = { owner: 'Propietario', admin: 'Admin POS', website_admin: 'Admin página web', manager: 'Gerencia', advisor: 'Asesora', warehouse: 'Bodega', production: 'Producción', marketing: 'Marketing' };

export function TeamAccess() {
  const { organizationId, roles } = useAuth();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('advisor');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    if (!organizationId) return;
    const { data, error: queryError } = await supabase.from('organization_memberships').select('user_id,role,active,created_at,profiles(full_name,email)').eq('organization_id', organizationId).order('created_at');
    if (queryError) setError(queryError.message); else setMembers(data || []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [organizationId]);
  const assign = async (event) => {
    event.preventDefault(); setMessage(''); setError('');
    const { error: assignError } = await supabase.rpc('assign_visualcorp_role', { p_email: email.trim(), p_role: role });
    if (assignError) { setError(assignError.message); return; }
    setEmail(''); setMessage('Perfil asignado. La persona debe ingresar con el enlace seguro enviado a su correo.'); await load();
  };
  return <div className="team-access"><div className="page-heading"><div><div className="eyebrow">USUARIOS Y PERMISOS</div><h1>Equipo Visual Corp</h1><p>Asigna el panel web o las herramientas internas después de que cada persona haya iniciado sesión por primera vez.</p></div><span className="local-badge"><Users size={14}/> {members.length} perfiles</span></div>
    <div className="dashboard-grid"><form className="panel form-panel" onSubmit={assign}><div className="panel-heading"><div><span className="eyebrow">NUEVO ACCESO</span><h2>Asignar perfil</h2></div><UserPlus size={19}/></div><label>Correo que ya inició sesión<input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="persona@visualcorp.com"/></label><label>Panel y permisos<select value={role} onChange={(e)=>setRole(e.target.value)}><option value="website_admin">Admin página web</option><option value="admin">Admin POS</option><option value="manager">Gerencia</option><option value="advisor">Asesora</option><option value="warehouse">Bodega</option><option value="production">Producción</option><option value="marketing">Marketing</option></select></label><button className="button button-dark" type="submit"><ShieldCheck size={16}/> Asignar acceso</button>{message&&<p role="status">{message}</p>}{error&&<p className="access-error" role="alert">{error}</p>}</form>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESOS ACTIVOS</span><h2>Roles y cuentas</h2></div></div>{loading?<p>Cargando perfiles…</p>:members.map((member,index)=><article className="activity-row" key={`${member.user_id}-${member.role}-${index}`}><span className="activity-avatar">{member.profiles?.full_name?.slice(0,1)||'V'}</span><span><b>{member.profiles?.full_name||member.profiles?.email||'Cuenta de equipo'}</b><small>{member.profiles?.email||member.user_id}</small></span><span className="inventory-status ok">{roleNames[member.role]||member.role}</span></article>)}</section></div>
    <div className="notice-box"><span><ShieldCheck size={17}/></span><div><b>Los permisos web y POS están separados</b><p>Admin página web gestiona el contenido público. Admin POS controla el trabajo interno. El propietario puede entrar a ambos espacios; las asesoras no ven costos privados.</p></div></div>
  </div>;
}
