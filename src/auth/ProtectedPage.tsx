import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { legacyPanelPaths, permissionByPath } from '../app/navigation';

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
      <h1>Visual Corp Suite</h1>
      <p>Inicia sesión para abrir el panel y acceder a los módulos habilitados para tu perfil.</p>
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

  if (auth.accessError && !auth.roles.length) return <main className="access-screen"><section className="access-card" role="alert">
    <img src={wordmark} alt="Visual Corp" />
    <span className="site-eyebrow"><i /> CONEXIÓN SEGURA</span>
    <h1>No pudimos comprobar tus permisos.</h1>
    <p>Revisa tu conexión y vuelve a intentarlo. Tu acceso no se cambiará por un problema temporal de conexión.</p>
    <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>Reintentar</button>
    <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión <LogOut size={16} /></button>
  </section></main>;

  const requiredModule = permissionByPath[location.pathname] || ({ website: 'website', catalog: 'catalog_admin', team: 'team', operations: 'dashboard' }[area]);
  // The lifecycle page combines several independently permissioned flows.
  // Let users enter when they can see at least one flow; the page then filters
  // its tabs and data by each flow's own permission.
  const canAccessPage = legacyPanelPaths.has(location.pathname)
    ? auth.hasPermission('dashboard', 'view')
    : location.pathname === '/operaciones/flujos'
    ? ['sales', 'inventory', 'workshop', 'quotes'].some((module) => auth.hasPermission(module, 'view'))
    : auth.hasPermission(requiredModule, 'view');
  if (!canAccessPage) return <main className="access-screen"><section className="access-card">
    <img src={wordmark} alt="Visual Corp" />
    <span className="site-eyebrow"><i /> PERMISOS</span>
    <h1>Tu perfil no tiene acceso a este panel.</h1>
    <p>El acceso al panel se configura por módulos y acciones. Solicita al propietario que revise tu perfil si necesitas esta sección.</p>
    <button className="site-primary-button" onClick={auth.signOut}>Cerrar sesión <LogOut size={16} /></button>
  </section></main>;

  return children;
}

