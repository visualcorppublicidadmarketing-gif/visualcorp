import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Gauge, Layers3, LogIn, LogOut, Moon, RotateCcw, ShieldCheck, Sparkles, Sun, UsersRound } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth, type WorkExceptionEntry, type WorkHourEntry } from './AuthProvider';
import { type PermissionModuleKey } from './accessCatalog';
import { canViewNavigationItem, legacyPanelPaths, permissionByPath, workspaceNavigation } from '../app/navigation';
import { useTheme } from '../app/ThemeProvider';

export type AccessArea = 'website' | 'catalog' | 'team' | 'operations' | 'backup' | 'team_schedule' | PermissionModuleKey;

type ProtectedPageProps = {
  area: AccessArea;
  children: ReactNode;
};

const wordmark = '/brand/visualcorp-wordmark.png';
const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const AREA_MODULE_MAP: Record<string, string> = {
  website: 'website',
  catalog: 'catalog_admin',
  team: 'team',
  operations: 'dashboard',
  backup: 'backup',
  team_schedule: 'team_schedule',
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No pudimos iniciar sesión.';
}

function formatWorkScheduleSummary(workHours: WorkHourEntry[], workException: WorkExceptionEntry): string {
  const ordered = [...workHours].sort((a, b) => a.weekday - b.weekday);
  const openWindows: Array<{ from: number; to: number; opensAt: string; closesAt: string }> = [];

  for (const entry of ordered) {
    if (!entry.is_open || !entry.opens_at || !entry.closes_at) continue;
    const prev = openWindows[openWindows.length - 1];
    if (prev && prev.to === entry.weekday - 1 && prev.opensAt === entry.opens_at && prev.closesAt === entry.closes_at) {
      prev.to = entry.weekday;
    } else {
      openWindows.push({
        from: entry.weekday,
        to: entry.weekday,
        opensAt: entry.opens_at.slice(0, 5),
        closesAt: entry.closes_at.slice(0, 5),
      });
    }
  }

  const baseSummary = openWindows.length
    ? `Horario vigente: ${openWindows
        .map((win) => {
          const dayLabel = win.from === win.to
            ? WEEKDAY_NAMES[win.from]
            : `${WEEKDAY_NAMES[win.from]} a ${WEEKDAY_NAMES[win.to]}`;
          return `${dayLabel} de ${win.opensAt} a ${win.closesAt}`;
        })
        .join(' · ')} (hora de Ecuador).`
    : 'El horario laboral vigente se encuentra cerrado en este momento (hora de Ecuador).';

  if (!workException) {
    return `${baseSummary} Si necesitas ingresar fuera de jornada, un administrador puede registrar una excepción.`;
  }

  const exceptionText = workException.kind === 'closed'
    ? `Hoy (${workException.work_date}) hay cierre especial registrado`
    : `Hoy (${workException.work_date}) rige un horario especial de ${(workException.opens_at || '').slice(0, 5)} a ${(workException.closes_at || '').slice(0, 5)}`;

  return `${baseSummary} ${exceptionText}${workException.note ? `: ${workException.note}` : '.'}`;
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

  const themeToggle = (
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
  );

  if (auth.loading) {
    return (
      <main className="access-screen">
        {themeToggle}
        <section className="access-card access-card--status" role="status" aria-live="polite">
          <img src={wordmark} alt="Visual Corp" />
          <span className="access-card-eyebrow"><i /> VERIFICACIÓN DE SESIÓN</span>
          <p>Verificando acceso seguro…</p>
        </section>
      </main>
    );
  }

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

    return (
      <motion.main
        className="access-screen access-screen--login"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
      >
        {themeToggle}

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
      </motion.main>
    );
  }

  if (auth.accessError && !auth.roles.length) {
    return (
      <main className="access-screen">
        {themeToggle}
        <section className="access-card access-card--status" role="alert">
          <img src={wordmark} alt="Visual Corp" />
          <span className="access-card-eyebrow"><i /> CONEXIÓN SEGURA</span>
          <h1>No pudimos comprobar tus permisos.</h1>
          <p>Por seguridad, el panel permanecerá cerrado hasta que podamos verificar tus permisos. Revisa la conexión e inténtalo de nuevo; tu cuenta y sus perfiles no se modifican.</p>
          <div className="access-card-actions">
            <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>
              <RotateCcw size={16} aria-hidden="true" /> Reintentar
            </button>
            <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>
              Cerrar sesión <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!auth.workAccessOpen && auth.user) {
    return (
      <main className="access-screen">
        {themeToggle}
        <section className="access-card access-card--status" role="status">
          <img src={wordmark} alt="Visual Corp" />
          <span className="access-card-eyebrow"><i /> FUERA DEL HORARIO DE TRABAJO</span>
          <h1>El panel se abrirá en el próximo horario laboral.</h1>
          <p>{formatWorkScheduleSummary(auth.workHours, auth.workException)}</p>
          <div className="access-card-actions">
            <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>
              <RotateCcw size={16} aria-hidden="true" /> Comprobar horario
            </button>
            <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>
              Cerrar sesión <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    );
  }

  const requiredModule = permissionByPath[location.pathname] || AREA_MODULE_MAP[area] || area;
  const navigationItem = workspaceNavigation.find((item) => item.to === location.pathname || item.aliases?.includes(location.pathname));
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
    if (hasNoProfiles) {
      return (
        <main className="access-screen">
          {themeToggle}
          <section className="access-card access-card--status">
            <img src={wordmark} alt="Visual Corp" />
            <span className="access-card-eyebrow"><i /> ACCESO INTERNO</span>
            <h1>Tu cuenta aún no tiene acceso.</h1>
            {userEmail && <p style={{ overflowWrap: 'anywhere' }}>Ingresaste con <strong>{userEmail}</strong>.</p>}
            <p role="status">
              {requestSent && 'Tu solicitud quedó registrada. Cuando un administrador la apruebe, puedes pulsar «Comprobar de nuevo» para entrar.'}
              {requestStatus === 'error' && 'No pudimos registrar tu solicitud. Pulsa «Comprobar de nuevo» para reintentar.'}
              {requestStatus === 'dismissed' && 'Tu solicitud fue descartada. Contacta a un administrador si todavía necesitas acceso.'}
              {!requestSent && requestStatus !== 'error' && requestStatus !== 'dismissed' && 'Pide a un administrador que revise el acceso de tu cuenta.'}
            </p>
            <div className="access-card-actions">
              <button className="site-primary-button" type="button" onClick={() => void auth.refreshAccess()}>Comprobar de nuevo</button>
              <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión <LogOut size={16} aria-hidden="true" /></button>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="access-screen">
        {themeToggle}
        <section className="access-card access-card--status">
          <img src={wordmark} alt="Visual Corp" />
          <span className="access-card-eyebrow"><i /> PERMISOS</span>
          <h1>Tu perfil no tiene acceso a este panel.</h1>
          <p>El acceso al panel se configura por módulos y acciones. Solicita al propietario que revise tu perfil si necesitas esta sección.</p>
          <div className="access-card-actions">
            <Link className="site-primary-button" to="/panel">Volver al panel</Link>
            <button className="site-secondary-button" type="button" onClick={() => void auth.signOut()}>Cerrar sesión <LogOut size={16} aria-hidden="true" /></button>
          </div>
        </section>
      </main>
    );
  }

  return children;
}
