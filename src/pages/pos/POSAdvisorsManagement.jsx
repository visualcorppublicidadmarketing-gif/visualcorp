import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Key,
  Target,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  X,
  Copy,
  Check,
  RefreshCw,
  MessageCircle,
  Calendar,
  Lock,
  Sparkles,
  Search,
  Dices,
  Cloud,
  CheckCheck,
  Smartphone
} from 'lucide-react';
import {
  loadPOSStore,
  savePOSStore,
  getMondayOfWeek,
  getISOWeekCode,
  rotateAdvisorsCredentials,
  formatWeeklyCredentialsText,
  createPOSAdvisor,
  updatePOSAdvisor,
  deletePOSAdvisor,
  regeneratePOSAdvisorPIN,
  fetchRemotePOSStore,
  subscribePOSRealtime,
  getRoleCapabilities,
  SYSTEM_ROLES
} from '../../lib/posStore';

export function POSAdvisorsManagement({ store: parentStore, setStore: parentSetStore }) {
  const [localStore, setLocalStore] = useState(loadPOSStore);
  const store = parentStore || localStore;
  const setStore = parentSetStore || setLocalStore;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdvisor, setEditingAdvisor] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSingleId, setCopiedSingleId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const [toastMessage, setToastMessage] = useState('');

  const currentMonday = getMondayOfWeek();
  const currentWeekCode = getISOWeekCode();

  // Load from remote Supabase on mount and subscribe to Realtime changes if standalone
  useEffect(() => {
    if (!parentStore) {
      fetchRemotePOSStore().then((remote) => {
        if (remote && remote.advisors) setLocalStore(remote);
      });

      const unsubscribe = subscribePOSRealtime((updatedStore) => {
        if (updatedStore && updatedStore.advisors) setLocalStore(updatedStore);
      });

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [parentStore]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pin: '',
    weeklyPin: '',
    weeklyPassword: '',
    phone: '',
    role: 'asesora',
    assignedArea: 'ventas',
    weeklyGoal: 3200,
    isActive: true
  });

  const money = (val) => `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const generateRandom6DigitPIN = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
  };

  const openCreateModal = () => {
    setEditingAdvisor(null);
    const tempPin = generateRandom6DigitPIN();
    setFormData({
      name: '',
      email: '',
      pin: tempPin,
      weeklyPin: tempPin,
      weeklyPassword: `asesora-${tempPin}`,
      phone: '',
      role: 'asesora',
      assignedArea: 'ventas',
      weeklyGoal: 3200,
      isActive: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (advisor) => {
    setEditingAdvisor(advisor);
    const pin = advisor.weeklyPin || advisor.pin || generateRandom6DigitPIN();
    setFormData({
      name: advisor.name || '',
      email: advisor.email || '',
      pin,
      weeklyPin: pin,
      weeklyPassword: advisor.weeklyPassword || `${(advisor.name || 'asesora').split(' ')[0].toLowerCase()}-${pin}`,
      phone: advisor.phone || '',
      role: advisor.role || 'asesora',
      assignedArea: advisor.assignedArea || SYSTEM_ROLES.find((role) => role.id === advisor.role)?.area || '',
      weeklyGoal: Number(advisor.weeklyGoal ?? 0),
      isActive: advisor.isActive !== false
    });
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    let pin = String(formData.weeklyPin || formData.pin || generateRandom6DigitPIN()).trim();
    if (pin.length !== 6 || isNaN(Number(pin))) {
      pin = generateRandom6DigitPIN();
    }

    const capabilities = getRoleCapabilities(formData.role);
    const payload = {
      ...formData,
      pin,
      weeklyPin: pin,
      weeklyPassword: formData.weeklyPassword || `${formData.name.split(' ')[0].toLowerCase() || 'asesora'}-${pin}`,
      weeklyGoal: capabilities.hasSalesGoal ? Number(formData.weeklyGoal || 0) : 0,
      canOpenCash: capabilities.canOpenCash,
      hasSalesGoal: capabilities.hasSalesGoal
    };

    if (editingAdvisor) {
      const { nextStore } = updatePOSAdvisor(store, editingAdvisor.id, payload);
      setStore(nextStore);
      showToast(`✅ Integrante "${formData.name}" actualizado y sincronizado.`);
    } else {
      const { nextStore } = createPOSAdvisor(store, payload);
      setStore(nextStore);
      showToast(`🎉 Integrante "${formData.name}" creado con su rol y espacio de trabajo.`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (advisor) => {
    const confirmMsg = `¿Estás seguro de eliminar a "${advisor.name}" del sistema?\n\nEsta acción eliminará sus credenciales de la base de datos, de la nube Supabase y de la pantalla de bloqueo de todas las terminales.`;
    if (window.confirm(confirmMsg)) {
      const nextStore = deletePOSAdvisor(store, advisor.id);
      setStore(nextStore);
      showToast(`🗑️ "${advisor.name}" ha sido eliminado del sistema y de todas las bases de datos.`);
    }
  };

  const toggleActive = (advisor) => {
    const nextState = !advisor.isActive;
    const { nextStore } = updatePOSAdvisor(store, advisor.id, { isActive: nextState });
    setStore(nextStore);
    showToast(nextState ? `🟢 "${advisor.name}" está activo en el equipo.` : `⏸️ "${advisor.name}" ha sido pausado.`);
  };

  const handleRegeneratePIN = (advisor) => {
    const newPin = generateRandom6DigitPIN();
    const { nextStore } = updatePOSAdvisor(store, advisor.id, {
      pin: newPin,
      weeklyPin: newPin,
      weeklyPassword: `${advisor.name.split(' ')[0].toLowerCase()}-${newPin}`
    });
    setStore(nextStore);
    showToast(`🎲 Nuevo PIN de 6 dígitos (${newPin}) asignado a "${advisor.name}".`);
  };

  // Rotate credentials only for staff authorized to use cash registers.
  const handleForceRotate = () => {
    if (window.confirm('¿Deseas generar y rotar nuevas contraseñas y PINs de 6 dígitos para todas las asesoras ahora mismo?')) {
      const rotated = rotateAdvisorsCredentials(store.advisors, true);
      const nextState = { ...store, advisors: rotated, lastUpdated: new Date().toISOString() };
      setStore(nextState);
      savePOSStore(nextState);
      // Remote sync all rotated
      rotated.forEach((adv) => updatePOSAdvisor(nextState, adv.id, adv));
      showToast('🔄 PINs de caja rotados para asesoras y administradores.');
    }
  };

  // Copy All Credentials to Clipboard
  const handleCopyAll = () => {
    const text = formatWeeklyCredentialsText(store.advisors, currentMonday);
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
    showToast('📋 Credenciales del equipo de caja copiadas.');
  };

  // Share to WhatsApp Web (All)
  const handleShareWhatsApp = () => {
    const text = formatWeeklyCredentialsText(store.advisors, currentMonday);
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // Copy Single Advisor Credential
  const handleCopySingle = (advisor) => {
    const capabilities = getRoleCapabilities(advisor.role);
    const destination = capabilities.canOpenCash ? 'caja' : 'pos';
    const goal = capabilities.hasSalesGoal ? `\n🎯 *Meta Semanal:* $${Number(advisor.weeklyGoal || 0).toFixed(2)}` : '';
    const text = `🔐 *GIGAPRINT — CREDENCIAL DE EQUIPO*\n👤 *Integrante:* ${advisor.name}\n🧩 *Rol:* ${SYSTEM_ROLES.find((role) => role.id === advisor.role)?.label || advisor.role}\n🔢 *PIN de acceso:* ${advisor.weeklyPin || advisor.pin}\n🔑 *Clave:* ${advisor.weeklyPassword}${goal}\n\n🌐 *Acceso:* https://gigaprint-ec.github.io/gigaprint-webpage/${destination}`;
    navigator.clipboard.writeText(text);
    setCopiedSingleId(advisor.id);
    setTimeout(() => setCopiedSingleId(null), 2500);
    showToast(`📋 Credencial de "${advisor.name}" copiada.`);
  };

  // Send Direct WhatsApp to single advisor
  const handleSendAdvisorWhatsApp = (advisor) => {
    const phone = (advisor.phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? `593${phone.substring(1)}` : (phone.startsWith('593') ? phone : `593${phone}`);
    const capabilities = getRoleCapabilities(advisor.role);
    const destination = capabilities.canOpenCash ? 'caja' : 'pos';
    const workspace = capabilities.canOpenCash ? 'caja y ventas' : 'coordinación de trabajos';
    const goal = capabilities.hasSalesGoal ? `\n🎯 *Meta Semanal:* $${Number(advisor.weeklyGoal || 0).toFixed(2)}` : '';
    const text = `Hola ${advisor.name} 👋,\n\nTu acceso a Gigaprint para esta semana (${currentWeekCode}) está listo. Tu espacio es *${workspace}*.\n\n🔢 *PIN de acceso:* ${advisor.weeklyPin || advisor.pin}\n🔑 *Clave:* ${advisor.weeklyPassword}${goal}\n\nIngresa aquí: https://gigaprint-ec.github.io/gigaprint-webpage/${destination}`;
    const url = phone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Filtered Advisors List
  const filteredAdvisors = (store.advisors || []).filter((adv) => {
    const matchesSearch =
      !searchQuery.trim() ||
      adv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (adv.email && adv.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (adv.phone && adv.phone.includes(searchQuery)) ||
      (adv.weeklyPin && adv.weeklyPin.includes(searchQuery));

    const matchesRole = selectedRoleFilter === 'all' || adv.role === selectedRoleFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && adv.isActive !== false) ||
      (statusFilter === 'inactive' && adv.isActive === false);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const activeCount = (store.advisors || []).filter((a) => a.isActive !== false).length;
  const cashCount = (store.advisors || []).filter((a) => a.isActive !== false && getRoleCapabilities(a.role).canOpenCash).length;
  const totalWeeklyGoal = (store.advisors || [])
    .filter((a) => a.isActive !== false && getRoleCapabilities(a.role).hasSalesGoal)
    .reduce((sum, a) => sum + Number(a.weeklyGoal || 0), 0);

  return (
    <div className="pos-container">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          background: 'var(--ink)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 700,
          border: '1px solid rgba(255,255,255,0.15)',
          animation: 'posSlideIn 0.3s ease'
        }}>
          <CheckCheck size={18} style={{ color: '#22c55e' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="pos-top-bar" style={{ flexWrap: 'wrap', gap: '14px' }}>
        <div className="pos-brand-badge">
          <h1>
            <Users size={22} style={{ color: 'var(--orange)' }} />
            Gestión de Equipo & Roles
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{store.advisors.length} Registrados</span>
            <span className="pos-sync-pill synced" style={{ padding: '3px 8px', fontSize: '11px' }}>
              <Cloud size={12} /> Supabase Realtime
            </span>
          </div>
        </div>

        <div className="pos-top-actions" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '13px' }}>
            <span>Activos: <b style={{ color: '#16a34a' }}>{activeCount}</b></span>
            <span>Con caja: <b style={{ color: 'var(--orange-dark)' }}>{cashCount}</b></span>
            <span>Meta de asesoras: <b style={{ color: 'var(--orange-dark)' }}>{money(totalWeeklyGoal)}</b></span>
          </div>
          <button
            type="button"
            className="pos-submit-order-btn"
            style={{ padding: '10px 18px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            onClick={openCreateModal}
          >
            <Plus size={17} /> Añadir integrante
          </button>
        </div>
      </div>

      {/* Weekly Credentials Broadcast Banner */}
      <div className="pos-card" style={{
        background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.08) 0%, rgba(251, 146, 60, 0.03) 100%)',
        border: '1.5px solid rgba(234, 88, 12, 0.35)',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="pos-badge-pill paid" style={{ background: 'var(--orange)', color: '#fff', fontSize: '11px', fontWeight: 800 }}>
                <Calendar size={12} /> SEMANA {currentWeekCode}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                Válidas desde Lun {currentMonday} (PINs de 6 Dígitos)
              </span>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 900, color: 'var(--ink)' }}>
              🔑 Credenciales semanales del equipo de caja
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', maxWidth: '640px' }}>
              Solo asesoras y administradores reciben acceso de caja. El resto del equipo usa su PIN para abrir coordinación y ver los trabajos de su área.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCopyAll}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1.5px solid var(--orange)',
                background: copiedAll ? '#16a34a' : 'var(--orange)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
              }}
            >
              {copiedAll ? <Check size={16} /> : <Copy size={16} />}
              {copiedAll ? '¡Copiado!' : 'Copiar Credenciales'}
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1.5px solid #25D366',
                background: '#25D366',
                color: '#fff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <MessageCircle size={16} /> WhatsApp Caja
            </button>

            <button
              type="button"
              onClick={handleForceRotate}
              title="Generar nuevos PINs de 6 dígitos ahora mismo"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid var(--line)',
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Rotar PINs de caja
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Search Control Strip */}
      <div className="pos-card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, correo, teléfono o PIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--ink)',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Role & Status Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>Rol:</span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'admin', label: '👑 Admin' },
            { id: 'encargado_local', label: '🏬 Encargado' },
            { id: 'coordinador_taller', label: '📋 Coordinador' },
            { id: 'disenador', label: '🎨 Diseño' },
            { id: 'operador_impresion', label: '🖨️ Impresión' },
            { id: 'operador_sublimacion', label: '👕 Sublimación' },
            { id: 'operador_corte_laser', label: '⚡ Corte Láser' },
            { id: 'asesora', label: '💼 Asesoras' }
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              className={`pos-cat-pill ${selectedRoleFilter === r.id ? 'active' : ''}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setSelectedRoleFilter(r.id)}
            >
              {r.label}
            </button>
          ))}

          <div style={{ height: '20px', width: '1px', background: 'var(--line)', margin: '0 4px' }} />

          {/* Status filter */}
          {['all', 'active', 'inactive'].map((st) => (
            <button
              key={st}
              type="button"
              className={`pos-cat-pill ${statusFilter === st ? 'active' : ''}`}
              style={{ padding: '6px 10px', fontSize: '11px' }}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? 'Ver Todos' : (st === 'active' ? 'Activos' : 'Pausados')}
            </button>
          ))}
        </div>
      </div>

      {/* =========================================================================
          ADVISORS GRID CARDS (DYNAMIC CRUD)
          ========================================================================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '16px'
      }}>
        {filteredAdvisors.map((advisor, idx) => {
          const capabilities = getRoleCapabilities(advisor.role);
          const initials = advisor.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
          const advisorOrders = (store.orders || []).filter((o) => o.advisorId === advisor.id);
          const totalSales = advisorOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
          const pendingOperations = (store.productionOperations || []).filter((operation) => operation.assignedTo === advisor.id && !['done', 'cancelled'].includes(operation.status));

          return (
            <div
              key={advisor.id}
              className="pos-card"
              style={{
                display: 'grid',
                gap: '14px',
                opacity: advisor.isActive !== false ? 1 : 0.6,
                borderLeft: advisor.isActive !== false ? '4px solid var(--orange)' : '4px solid var(--muted)',
                position: 'relative'
              }}
            >
              {/* Header: Avatar, Name, Role & Quick Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '13px',
                    background: advisor.isActive !== false ? 'linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%)' : 'var(--line)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '16px'
                  }}>
                    {initials}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                      {advisor.name}
                    </h3>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{
                        fontSize: '10.5px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--muted)'
                      }}>
                        {advisor.role || 'asesora'}
                      </span>
                      <small style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        #{idx + 1}
                      </small>
                    </div>
                  </div>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => openEditModal(advisor)}
                    style={{
                      border: '1px solid var(--line)',
                      background: 'var(--paper)',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                      padding: '7px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Editar datos del asesor"
                  >
                    <Edit2 size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(advisor)}
                    style={{
                      border: '1px solid rgba(220, 38, 38, 0.2)',
                      background: '#fef2f2',
                      cursor: 'pointer',
                      color: '#dc2626',
                      padding: '7px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Eliminar asesor de todas las bases de datos"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Weekly 6-Digit PIN Credential Box */}
              <div style={{
                background: 'var(--bg)',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block' }}>
                    {capabilities.canOpenCash ? `PIN DE CAJA (${currentWeekCode})` : 'PIN DE ACCESO OPERATIVO'}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ink)' }}>
                      PIN: <code style={{ color: 'var(--orange-dark)', background: 'var(--orange-soft)', padding: '2px 7px', borderRadius: '5px', fontSize: '13px', letterSpacing: '1px' }}>{advisor.weeklyPin || advisor.pin || '123456'}</code>
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Clave: <b>{advisor.weeklyPassword || `${advisor.name.toLowerCase()}-123456`}</b>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '5px' }}>
                  {/* Regenerate PIN button */}
                  <button
                    type="button"
                    onClick={() => handleRegeneratePIN(advisor)}
                    title="Generar nuevo PIN de 6 dígitos aleatorio"
                    style={{
                      border: '1px solid var(--line)',
                      background: 'var(--paper)',
                      color: 'var(--ink)',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Dices size={13} style={{ color: 'var(--orange)' }} /> PIN
                  </button>

                  {/* Copy Credential */}
                  <button
                    type="button"
                    onClick={() => handleCopySingle(advisor)}
                    style={{
                      border: 0,
                      background: copiedSingleId === advisor.id ? '#dcfce7' : 'var(--paper)',
                      color: copiedSingleId === advisor.id ? '#166534' : 'var(--orange-dark)',
                      padding: '6px 9px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {copiedSingleId === advisor.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>

                  {/* Send Direct WhatsApp */}
                  <button
                    type="button"
                    onClick={() => handleSendAdvisorWhatsApp(advisor)}
                    title="Enviar PIN por WhatsApp"
                    style={{
                      border: 0,
                      background: '#dcfce7',
                      color: '#166534',
                      padding: '6px 9px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <MessageCircle size={13} />
                  </button>
                </div>
              </div>

              {/* Role-specific performance and coordination */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>{capabilities.hasSalesGoal ? 'Meta Semanal:' : 'Espacio de trabajo:'}</span>
                  <strong style={{ color: 'var(--orange-dark)' }}>{capabilities.hasSalesGoal ? money(advisor.weeklyGoal ?? 0) : (SYSTEM_ROLES.find((role) => role.id === advisor.role)?.area || advisor.assignedArea || 'Coordinación')}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block' }}>{capabilities.canOpenCash ? 'Ventas del Turno:' : 'Trabajos pendientes:'}</span>
                  <strong>{capabilities.canOpenCash ? `${money(totalSales)} (${advisorOrders.length})` : pendingOperations.length}</strong>
                </div>
              </div>

              {/* Status footer & toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '10px',
                borderTop: '1px solid var(--line)',
                fontSize: '12px'
              }}>
                <button
                  type="button"
                  onClick={() => toggleActive(advisor)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: advisor.isActive !== false ? '#16a34a' : 'var(--muted)',
                    fontWeight: 700
                  }}
                >
                  {advisor.isActive !== false ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {advisor.isActive !== false ? (capabilities.canOpenCash ? 'Activo en Caja' : 'Activo en Coordinación') : 'Pausado / Inactivo'}
                </button>
                <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  {advisor.phone || advisor.email || 'Sin contacto'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAdvisors.length === 0 && (
        <div className="pos-card" style={{ textAlign: 'center', padding: '40px 20px', marginTop: '20px' }}>
          <Users size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--ink)' }}>No se encontraron integrantes</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
            Prueba ajustando el término de búsqueda o añade un integrante con el botón superior.
          </p>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE / EDIT ADVISOR (6-DIGIT PIN & SUPABASE SYNC)
          ========================================================================= */}
      {isModalOpen && (
        <div className="pos-modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div className="pos-modal-content" style={{
            background: 'var(--paper)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '480px',
            border: '1px solid var(--line)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="pos-brand-logo-mark" style={{ width: '32px', height: '32px', fontSize: '14px' }}>G</div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>
                  {editingAdvisor ? 'Editar integrante' : 'Registrar integrante'}
                </h3>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gap: '12px' }}>
              <div className="pos-form-group">
                <label>Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Vicky Morales"
                  value={formData.name}
                  onChange={(e) => setFormData({
                    ...formData,
                    name: e.target.value,
                    weeklyPassword: `${e.target.value.split(' ')[0].toLowerCase()}-${formData.weeklyPin || '123456'}`
                  })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="pos-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>PIN de acceso (6d) *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newPin = generateRandom6DigitPIN();
                        setFormData({
                          ...formData,
                          weeklyPin: newPin,
                          pin: newPin,
                          weeklyPassword: `${(formData.name || 'asesora').split(' ')[0].toLowerCase()}-${newPin}`
                        });
                      }}
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: 'var(--orange-dark)',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      <Dices size={12} /> Generar
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ej. 849201"
                    value={formData.weeklyPin}
                    onChange={(e) => setFormData({
                      ...formData,
                      weeklyPin: e.target.value,
                      pin: e.target.value,
                      weeklyPassword: `${(formData.name || 'asesora').split(' ')[0].toLowerCase()}-${e.target.value}`
                    })}
                  />
                </div>

                <div className="pos-form-group">
                  <label>Rol y Responsabilidad</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const role = SYSTEM_ROLES.find((item) => item.id === e.target.value);
                      setFormData({ ...formData, role: e.target.value, assignedArea: role?.area || '', weeklyGoal: getRoleCapabilities(e.target.value).hasSalesGoal ? (formData.weeklyGoal || 3200) : 0 });
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                      fontWeight: 700
                    }}
                  >
                    {SYSTEM_ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="pos-form-group">
                  <label>Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="0991234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                {getRoleCapabilities(formData.role).hasSalesGoal && <div className="pos-form-group">
                  <label>Meta Semanal ($)</label>
                  <input
                    type="number"
                    step="50"
                    value={formData.weeklyGoal}
                    onChange={(e) => setFormData({ ...formData, weeklyGoal: Number(e.target.value) || 0 })}
                  />
                </div>}
              </div>

              <div className="pos-form-group">
                <label>Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="asesora@gigaprint.ec"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--line)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pos-submit-order-btn"
                  style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                >
                  {editingAdvisor ? 'Guardar Cambios' : 'Crear integrante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default POSAdvisorsManagement;
