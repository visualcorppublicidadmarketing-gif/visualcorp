import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  ShieldCheck,
  Calendar,
  Key,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Delete,
  X
} from 'lucide-react';
import {
  authenticateAdvisor,
  authenticateAdmin,
  getISOWeekCode,
  getMondayOfWeek,
  getRoleCapabilities,
  SYSTEM_ROLES
} from '../../lib/posStore';

export function POSLockScreen({ advisors = [], onAuthenticated, onUnlockSuccess, onAdminAuthenticate, existingAdmin = null, defaultAdminEmail = '' }) {
  const handleAuthCallback = onAuthenticated || onUnlockSuccess || (() => {});
  const teamMembers = advisors.filter((person) => !['admin', 'super_admin'].includes(person.role));
  const [selectedAdvisorId, setSelectedAdvisorId] = useState(teamMembers[0]?.id || 'adv-vicky');
  const [pinInput, setPinInput] = useState('');
  const [loginMode, setLoginMode] = useState('advisor'); // 'advisor' | 'admin'
  const [adminEmail, setAdminEmail] = useState(defaultAdminEmail);
  const [adminPass, setAdminPass] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [advisorSubmitting, setAdvisorSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const currentMonday = getMondayOfWeek();
  const currentWeekCode = getISOWeekCode();

  const selectedAdvisor = teamMembers.find((a) => a.id === selectedAdvisorId) || teamMembers[0] || { name: 'Vicky', id: 'adv-vicky', role: 'asesora' };
  const selectedCapabilities = getRoleCapabilities(selectedAdvisor.role);
  const selectedRole = SYSTEM_ROLES.find((role) => role.id === selectedAdvisor.role);

  const attemptAdvisorLogin = async (pin) => {
    if (advisorSubmitting) return;
    setAdvisorSubmitting(true);
    const res = await authenticateAdvisor(advisors, selectedAdvisorId, pin);
    setAdvisorSubmitting(false);
    if (res.ok) handleAuthCallback(res.session);
    else triggerError(res.error || 'PIN de 6 dígitos incorrecto.');
  };

  useEffect(() => {
    if (teamMembers.length && !teamMembers.some((person) => person.id === selectedAdvisorId)) {
      setSelectedAdvisorId(teamMembers[0].id);
    }
  }, [advisors, selectedAdvisorId]);

  // Handle Physical Keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loginMode === 'advisor') {
        if (e.key >= '0' && e.key <= '9') {
          setPinInput((prev) => {
            if (prev.length >= 6) return prev;
            const nextPin = prev + e.key;
            if (nextPin.length === 6) {
              setTimeout(() => attemptAdvisorLogin(nextPin), 120);
            }
            return nextPin;
          });
          setErrorMsg('');
        } else if (e.key === 'Backspace') {
          setPinInput((prev) => prev.slice(0, -1));
          setErrorMsg('');
        } else if (e.key === 'Enter') {
          handleAdvisorSubmit();
        } else if (e.key === 'Escape') {
          setPinInput('');
          setErrorMsg('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loginMode, selectedAdvisorId, advisors]);

  const handleKeypadPress = (num) => {
    setPinInput((prev) => {
      if (prev.length >= 6) return prev;
      const nextPin = prev + num;
      if (nextPin.length === 6) {
        setTimeout(() => attemptAdvisorLogin(nextPin), 120);
      }
      return nextPin;
    });
    setErrorMsg('');
  };

  const handleKeypadBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleKeypadClear = () => {
    setPinInput('');
    setErrorMsg('');
  };

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
    setPinInput('');
  };

  const handleAdvisorSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!pinInput.trim()) {
      triggerError('Por favor ingresa tu PIN de 6 dígitos.');
      return;
    }

    await attemptAdvisorLogin(pinInput);
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (existingAdmin) {
      handleAuthCallback(existingAdmin);
      return;
    }
    if (!adminEmail.trim()) {
      triggerError('Ingresa el correo del administrador.');
      return;
    }
    if (!adminPass.trim()) {
      triggerError('Ingresa la contraseña del administrador.');
      return;
    }

    setAdminSubmitting(true);
    const res = onAdminAuthenticate
      ? await onAdminAuthenticate({ email: adminEmail.trim(), password: adminPass })
      : authenticateAdmin(adminPass);
    setAdminSubmitting(false);
    if (res.ok) {
      handleAuthCallback(res.session);
    } else {
      triggerError(res.error || 'Contraseña incorrecta.');
    }
  };

  return (
    <div className="pos-lock-screen-wrapper">
      <div className={`pos-lock-modal-card ${isShaking ? 'pos-shake' : ''}`}>
        {/* Brand & Week Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--pos-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="pos-brand-logo-mark" style={{ width: '42px', height: '42px' }}>G</div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--pos-text-main)' }}>
                Gigaprint Equipo
              </h2>
              <small style={{ color: 'var(--pos-text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 800 }}>
                Operación, coordinación y caja
              </small>
            </div>
          </div>

          <div className="pos-sync-pill synced">
            <Calendar size={13} style={{ color: 'var(--pos-primary)' }} />
            <span>Semana <b>{currentWeekCode}</b></span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: '#f1f5f9', padding: '5px', borderRadius: '14px' }}>
          <button
            type="button"
            className={`pos-nav-tab ${loginMode === 'advisor' ? 'active' : ''}`}
            style={{ justifyContent: 'center', padding: '9px', fontSize: '12.5px' }}
            onClick={() => {
              setLoginMode('advisor');
              setErrorMsg('');
              setPinInput('');
            }}
          >
            <User size={15} /> Acceso del equipo
          </button>
          <button
            type="button"
            className={`pos-nav-tab ${loginMode === 'admin' ? 'active' : ''}`}
            style={{ justifyContent: 'center', padding: '9px', fontSize: '12.5px' }}
            onClick={() => {
              setLoginMode('admin');
              setErrorMsg('');
              setAdminPass('');
            }}
          >
            <ShieldCheck size={15} /> Acceso Administrador
          </button>
        </div>

        {/* ADVISOR LOGIN MODE */}
        {loginMode === 'advisor' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            {/* Team member selector */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {(teamMembers.length > 0 ? teamMembers : [{ id: 'adv-vicky', name: 'Vicky', role: 'asesora' }])
                .filter((a) => a.isActive !== false)
                .map((adv) => {
                  const isSelected = adv.id === selectedAdvisorId;
                  const initials = adv.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
                  return (
                    <button
                      key={adv.id}
                      type="button"
                      className={`pos-cat-pill ${isSelected ? 'active' : ''}`}
                      style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px' }}
                      onClick={() => {
                        setSelectedAdvisorId(adv.id);
                        setPinInput('');
                        setErrorMsg('');
                      }}
                    >
                      <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: isSelected ? '#ffffff' : 'var(--pos-primary)', color: isSelected ? 'var(--pos-primary)' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>
                        {initials}
                      </span>
                      <span>{adv.name}</span>
                    </button>
                  );
                })}
            </div>

            {/* Selected Advisor Display */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '11px', background: '#f8fafc', border: '1px solid var(--pos-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <Key size={16} style={{ color: 'var(--pos-primary)' }} />
                <span>PIN de acceso de <b>{selectedAdvisor?.name}</b></span>
              </div>
              <small style={{ color: 'var(--pos-text-muted)', fontSize: '11px', fontWeight: 700 }}>
                {selectedRole?.label || selectedAdvisor.role}
              </small>
            </div>

            {/* PIN Mask Display (6 Digits) */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', padding: '16px', background: '#f8fafc', borderRadius: '14px', border: '1.5px solid var(--pos-border)' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <span
                    key={idx}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: pinInput.length > idx ? 'var(--pos-primary)' : '#cbd5e1',
                      transform: pinInput.length > idx ? 'scale(1.2)' : 'none',
                      boxShadow: pinInput.length > idx ? '0 0 10px rgba(234, 88, 12, 0.4)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'var(--pos-danger-soft)', color: 'var(--pos-danger-dark)', fontSize: '12.5px', fontWeight: 700, border: '1px solid var(--pos-danger-border)' }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Touch Keypad */}
            <div className="pos-touch-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="pos-keypad-btn"
                  onClick={() => handleKeypadPress(String(num))}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="pos-keypad-btn"
                style={{ background: '#f8fafc', color: 'var(--pos-text-muted)', fontSize: '15px' }}
                onClick={handleKeypadClear}
                title="Limpiar"
              >
                C
              </button>
              <button
                type="button"
                className="pos-keypad-btn"
                onClick={() => handleKeypadPress('0')}
              >
                0
              </button>
              <button
                type="button"
                className="pos-keypad-btn"
                style={{ background: '#f8fafc', color: 'var(--pos-text-muted)' }}
                onClick={handleKeypadBackspace}
                title="Borrar dígito"
              >
                <Delete size={19} />
              </button>
            </div>

            <div style={{ padding: '10px 14px', borderRadius: '11px', background: 'var(--pos-primary-soft)', color: 'var(--pos-text-main)', fontSize: '12px', lineHeight: 1.5 }}>
              {selectedCapabilities.canOpenCash
                ? 'Al ingresar podrás abrir caja, registrar ventas y gestionar clientes.'
                : `Al ingresar abrirás coordinación de trabajos${selectedCapabilities.managedAreas.length ? ` para ${selectedCapabilities.managedAreas.join(', ')}` : ''}. Este rol no abre caja ni tiene meta comercial.`}
            </div>

            {/* Unlock Button */}
            <button
              type="button"
              className="pos-add-cart-btn"
              style={{ padding: '14px', fontSize: '15px' }}
              onClick={handleAdvisorSubmit}
              disabled={pinInput.length === 0 || advisorSubmitting}
            >
              <span>{advisorSubmitting ? 'Verificando acceso seguro…' : 'Entrar a mi espacio de trabajo'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ADMIN LOGIN MODE */}
        {loginMode === 'admin' && (
          <form onSubmit={handleAdminSubmit} style={{ display: 'grid', gap: '14px' }}>
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-hover) 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
                boxShadow: '0 8px 20px rgba(234, 88, 12, 0.3)'
              }}>
                <ShieldCheck size={28} />
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 900, color: 'var(--pos-text-main)' }}>
                Modo Administrador General
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--pos-text-muted)' }}>
                {existingAdmin ? `Sesión Supabase activa como ${existingAdmin.email || 'administrador'}.` : 'Usa el mismo correo y contraseña de Supabase del Panel Gigaprint.'}
              </p>
            </div>

            {errorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'var(--pos-danger-soft)', color: 'var(--pos-danger-dark)', fontSize: '12.5px', fontWeight: 700, border: '1px solid var(--pos-danger-border)' }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {!existingAdmin && <div>
              <label className="pos-label required">Correo del administrador</label>
              <input
                type="email"
                autoComplete="username"
                className="pos-input"
                placeholder="administrador@gigaprint.ec"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  setErrorMsg('');
                }}
                style={{ fontSize: '15px', padding: '12px 14px', marginBottom: '10px' }}
              />
              <label className="pos-label required">Contraseña de Supabase</label>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                className="pos-input"
                placeholder="Ingresa tu contraseña"
                value={adminPass}
                onChange={(e) => {
                  setAdminPass(e.target.value);
                  setErrorMsg('');
                }}
                style={{ fontSize: '15px', padding: '12px 14px' }}
              />
            </div>}

            <button
              type="submit"
              className="pos-add-cart-btn"
              style={{ padding: '14px', fontSize: '15px' }}
            >
              <span>{adminSubmitting ? 'Verificando…' : (existingAdmin ? 'Continuar como Administrador' : 'Entrar como Administrador')}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
