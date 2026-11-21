import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUpRight, Gauge, Layers3, LogIn, LogOut, Moon, ShieldCheck, Sparkles, Sun, UsersRound } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from './AuthProvider';
import { canViewNavigationItem, legacyPanelPaths, permissionByPath, workspaceNavigation } from '../app/navigation';
import { useTheme } from '../app/ThemeProvider';

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
  const [emailLoading, setEmailLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  if (auth.loading) return <main className="access-screen"><p>Verificando acceso seguro…</p></main>;

  if (!auth.user) {
    const sendLink = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError('');
      setMessage('');
      setEmailLoading(true);
      try {
        await auth.sendSignInLink(email.trim());
        setMessage('Te enviamos un enlace de acceso al correo. Ábrelo en este mismo navegador para continuar.');
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setEmailLoading(false);
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

    return <motion.main
      className="access-screen access-screen--login"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
    >
      <button
        className="access-theme-toggle"
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Cambiar al modo claro' : 'Cambiar al modo oscuro'}
        title={theme === 'dark' ? 'Cambiar al modo claro' : 'Cambiar al modo oscuro'}
      >
        {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        <span>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
      </button>

      <div className="access-layout">
        <motion.section
          className="access-story"
          aria-labelledby="access-story-title"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.04, ease: 'easeOut' }}
        >
          <div className="access-brand-lockup">
            <img src="/brand/visualcorp-symbol.png" alt="" aria-hidden="true" />
            <span><strong>VISUAL CORP</strong><small>CREATIVE WORKSPACE</small></span>
          </div>
          <span className="access-kicker"><i /> TU ESPACIO DE TRABAJO</span>
          <h1 id="access-story-title">Un solo espacio.<br /><em>Todo tu equipo.</em></h1>
          <p className="access-story-copy">Entra a las herramientas, proyectos y tareas de Visual Corp desde un espacio creado para trabajar en equipo.</p>

          <div className="access-visual" aria-hidden="true">
            <span className="access-visual-orbit access-visual-orbit--outer" />
            <span className="access-visual-orbit access-visual-orbit--inner" />
            <span className="access-visual-glow" />
            <span className="access-visual-mark"><img src="/brand/visualcorp-symbol.png" alt="" /></span>
            <span className="access-visual-note"><Sparkles size={15} /> Ideas en movimiento</span>
          </div>

          <ul className="access-capabilities" aria-label="Áreas de trabajo">
            <li><Layers3 size={15} aria-hidden="true" /> Herramientas</li>
            <li><UsersRound size={15} aria-hidden="true" /> Equipo</li>
            <li><Gauge size={15} aria-hidden="true" /> Operaciones</li>
          </ul>
          <div className="access-story-footer"><ShieldCheck size={16} aria-hidden="true" /><span>Acceso privado para el equipo Visual Corp</span></div>
        </motion.section>

        <motion.section
          className="access-panel"
          aria-labelledby="access-login-title"
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.48, delay: reduceMotion ? 0 : 0.1, ease: 'easeOut' }}
        >
          <form className="access-card access-card--login" onSubmit={sendLink}>
            <span className="access-card-eyebrow"><i /> ACCESO INTERNO</span>
            <div className="access-card-heading">
              <h2 id="access-login-title">Te damos la bienvenida</h2>
              <p>Inicia sesión para abrir tu espacio de trabajo y ver los módulos habilitados para tu perfil.</p>
            </div>

            <button className="access-oauth-button" type="button" disabled={oauthLoading || emailLoading} onClick={signInWithGoogle}>
              <span className="access-oauth-icon" aria-hidden="true"><LogIn size={17} /></span>
              <span>{oauthLoading ? 'Conectando con Google…' : 'Continuar con Google'}</span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>

            <div className="access-divider"><span>o continúa con tu correo</span></div>

            <label className="access-field" htmlFor="access-email">
              <span>Correo de Visual Corp</span>
              <input
                id="access-email"
                type="email"
                required
                autoComplete="email"
                aria-describedby="access-email-help"
                placeholder="Escribe tu correo de trabajo"
                value={email}
                disabled={oauthLoading || emailLoading}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <small className="access-helper" id="access-email-help">Te enviaremos un enlace seguro para continuar en este navegador.</small>

            <button className="access-submit-button" type="submit" disabled={emailLoading || oauthLoading}>
              <span>{emailLoading ? 'Enviando enlace…' : 'Enviar enlace de acceso'}</span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            {message && <small className="access-feedback access-feedback--success" role="status"><ShieldCheck size={16} aria-hidden="true" />{message}</small>}
            {error && <small className="access-feedback access-feedback--error" role="alert">{error}</small>}
            <div className="access-card-footer"><ShieldCheck size={14} aria-hidden="true" /><span>Tu acceso se verifica de forma segura</span></div>
          </form>
        </motion.section>
      </div>
    </motion.main>;
  }

  if (auth.accessError && !auth.roles.length) return <main className="access-screen"><section className="access-card" role="alert">
    <img src={wordmark} alt="Visual Corp" />
    <span className="site-eyebrow"><i /> CONEXIÓN SEGURA</span>
    <h1>No pudimos comprobar tus permisos.</h1>
    <p>Por seguridad, el panel permanecerá cerrado hasta que podamos verificar tus permisos. Revisa la conexión e inténtalo de nuevo; tu cuenta y sus perfiles no se modifican.</p>
    <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>Reintentar</button>
    <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión <LogOut size={16} /></button>
  </section></main>;

  if (!auth.workAccessOpen && auth.user) return <main className="access-screen"><section className="access-card" role="status">
    <img src={wordmark} alt="Visual Corp" />
    <span className="site-eyebrow"><i /> FUERA DEL HORARIO DE TRABAJO</span>
    <h1>El panel se abrirá en el próximo horario laboral.</h1>
    <p>El acceso del equipo funciona de lunes a viernes de 08:00 a 18:30 y los sábados de 08:00 a 13:00, hora de Ecuador. Los horarios especiales que registre un administrador también se aplican aquí.</p>
    <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión</button>
  </section></main>;

  const requiredModule = permissionByPath[location.pathname] || ({ website: 'website', catalog: 'catalog_admin', team: 'team', operations: 'dashboard' }[area]);
  // The lifecycle page combines several independently permissioned flows.
  // Let users enter when they can see at least one flow; the page then filters
  // its tabs and data by each flow's own permission.
  const navigationItem = workspaceNavigation.find((item) => item.to === location.pathname);
  const canAccessPage = legacyPanelPaths.has(location.pathname)
    ? auth.hasPermission('dashboard', 'view')
    : navigationItem
    ? canViewNavigationItem(navigationItem, auth.hasPermission)
    : auth.hasPermission(requiredModule, 'view');
  if (!canAccessPage) {
    const hasNoProfiles = !(auth.profiles || []).length;
    const userEmail = auth.user?.email;
    const requestStatus = auth.accessRequestStatus;
    const requestSent = requestStatus === 'recorded';
    if (hasNoProfiles) return <main className="access-screen"><section className="access-card">
      <img src={wordmark} alt="Visual Corp" />
      <span className="site-eyebrow"><i /> ACCESO INTERNO</span>
      <h1>Tu cuenta aún no tiene acceso.</h1>
      {userEmail && <p style={{ overflowWrap: 'anywhere' }}>Ingresaste con <strong>{userEmail}</strong>.</p>}
      <p role="status">
        {requestSent && 'Tu solicitud quedó registrada. Cuando un administrador la apruebe, puedes pulsar «Comprobar de nuevo» para entrar.'}
        {requestStatus === 'error' && 'No pudimos registrar tu solicitud. Pulsa «Comprobar de nuevo» para reintentar.'}
        {requestStatus === 'dismissed' && 'Tu solicitud fue descartada. Contacta a un administrador si todavía necesitas acceso.'}
        {!requestSent && requestStatus !== 'error' && requestStatus !== 'dismissed' && 'Pide a un administrador que revise el acceso de tu cuenta.'}
      </p>
      <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>Comprobar de nuevo</button>
      <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión <LogOut size={16} /></button>
    </section></main>;
    return <main className="access-screen"><section className="access-card">
      <img src={wordmark} alt="Visual Corp" />
      <span className="site-eyebrow"><i /> PERMISOS</span>
      <h1>Tu perfil no tiene acceso a este panel.</h1>
      <p>El acceso al panel se configura por módulos y acciones. Solicita al propietario que revise tu perfil si necesitas esta sección.</p>
      <button className="site-primary-button" onClick={auth.signOut}>Cerrar sesión <LogOut size={16} /></button>
    </section></main>;
  }

  return children;
}

