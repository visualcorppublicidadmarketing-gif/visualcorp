import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

type AccessArea = 'website' | 'catalog' | 'team' | 'operations';

type ProtectedPageProps = {
  area: AccessArea;
  children: ReactNode;
};

const wordmark = '/brand/visualcorp-wordmark.png';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No pudimos iniciar sesión.';
}

export function ProtectedPage({ area, children }: ProtectedPageProps) {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);

  if (auth.loading) return <main className="access-screen"><p>Verificando acceso seguro…</p></main>;

  if (!auth.user) {
    const sendLink = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError('');
      setMessage('');
      try {
        await auth.sendSignInLink(email.trim());
        setMessage('Te enviamos un enlace de acceso al correo. Ábrelo en este mismo navegador para continuar.');
      } catch (err) {
        setError(errorMessage(err));
      }
    };

    const signInWithGoogle = async () => {
      setError('');
      setMessage('');
      setOauthLoading(true);
      try {
        await auth.signInWithGoogle();
      } catch (err) {
        setError(errorMessage(err));
        setOauthLoading(false);
      }
    };

    return <main className="access-screen"><form className="access-card" onSubmit={sendLink}>
      <img src={wordmark} alt="Visual Corp" />
      <span className="site-eyebrow"><i /> ACCESO INTERNO</span>
      <h1>{area === 'website' ? 'Administración de la página web' : 'Administración POS y gestión interna'}</h1>
      <p>Inicia sesión con tu cuenta de Google autorizada o solicita un enlace seguro por correo.</p>
      <button className="site-primary-button" type="button" disabled={oauthLoading} onClick={signInWithGoogle}>
        {oauthLoading ? 'Conectando con Google…' : 'Continuar con Google'} <ArrowUpRight size={16} />
      </button>
      <div className="divider-label">O USA UN ENLACE POR CORREO</div>
      <label>Correo de Visual Corp<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="site-primary-button" type="submit">Enviar enlace de acceso <ArrowUpRight size={16} /></button>
      {message && <small role="status">{message}</small>}
      {error && <small className="access-error" role="alert">{error}</small>}
    </form></main>;
  }

  const moduleByPath: Record<string, string> = {
    '/admin': 'dashboard', '/admin/sitio': 'website', '/admin/contenido': 'website', '/admin/solicitudes': 'crm',
    '/admin/marketing': 'marketing', '/admin/cambios': 'team', '/admin/respaldo': 'backup',
    '/operaciones': 'dashboard', '/operaciones/pos': 'sales', '/operaciones/flujos': 'workshop',
    '/operaciones/cambios': 'team', '/operaciones/cotizador': 'quotes', '/operaciones/inventario': 'inventory',
    '/operaciones/compras': 'purchases', '/operaciones/clientes': 'crm', '/operaciones/crm': 'crm',
    '/operaciones/marketing': 'marketing', '/operaciones/equipo': 'team', '/operaciones/catalogo': 'catalog_admin',
  };
  const requiredModule = moduleByPath[location.pathname] || ({ website: 'website', catalog: 'catalog_admin', team: 'team', operations: 'dashboard' }[area]);
  if (!auth.hasPermission(requiredModule, 'view')) return <main className="access-screen"><section className="access-card">
    <img src={wordmark} alt="Visual Corp" />
    <span className="site-eyebrow"><i /> PERMISOS</span>
    <h1>Tu perfil no tiene acceso a este panel.</h1>
    <p>La página web y las operaciones internas usan permisos separados. Solicita al propietario que asigne el rol correspondiente.</p>
    <button className="site-primary-button" onClick={auth.signOut}>Cerrar sesión <LogOut size={16} /></button>
  </section></main>;

  return children;
}
