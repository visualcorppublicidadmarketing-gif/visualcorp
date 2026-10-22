import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Star,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  RotateCcw,
  Clock,
  MessageCircle,
  Edit2,
  Save,
  X,
  Send,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Tag
} from 'lucide-react';
import {
  upsertCustomer,
  deleteCustomer,
  logCustomerActivity,
  clonePOSOrder,
  toISODate
} from '../../lib/posStore';
import { useToast } from '../../components/studio/Toast';

export function POSCustomerCRM({ store, onStoreUpdate, onReorder }) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(store.customers?.[0]?.id || null);
  const [filterTag, setFilterTag] = useState('all');
  
  // Modal Edit/Create Customer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    identification: '',
    phone: '',
    email: '',
    city: 'Milagro',
    address: '',
    companyName: '',
    isVip: false,
    creditLimit: 0,
    creditDays: 0,
    tags: 'General',
    notes: ''
  });

  // Modal Add Activity Log
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityForm, setActivityForm] = useState({
    activityType: 'whatsapp',
    title: '',
    description: ''
  });

  // Modal WhatsApp Dynamic Template Picker
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('ready');
  const [customWhatsAppMsg, setCustomWhatsAppMsg] = useState('');

  // Derived Customer Stats
  const customerStats = useMemo(() => {
    const stats = {};
    (store.customers || []).forEach((cust) => {
      const orders = (store.orders || []).filter((o) => o.customerId === cust.id || o.customerName === cust.name);
      const orderCount = orders.length;
      const totalSpent = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const totalBalanceDue = orders.reduce((sum, o) => sum + Number(o.balanceDue || 0), 0);
      const lastOrder = orders.sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0];
      const isInactive = lastOrder ? (new Date() - new Date(lastOrder.orderDate)) / (1000 * 60 * 60 * 24) > 30 : false;

      stats[cust.id] = {
        orderCount,
        totalSpent,
        totalBalanceDue,
        lastOrderDate: lastOrder ? lastOrder.orderDate : null,
        isInactive,
        orders
      };
    });
    return stats;
  }, [store.customers, store.orders]);

  // Filtered Customer List
  const filteredCustomers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return (store.customers || []).filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(q) ||
        (c.identification && c.identification.includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q));

      const matchTag = filterTag === 'all' || (Array.isArray(c.tags) && c.tags.includes(filterTag));
      return matchSearch && matchTag;
    });
  }, [store.customers, searchTerm, filterTag]);

  // Selected Customer Record
  const selectedCustomer = (store.customers || []).find((c) => c.id === selectedCustomerId) || filteredCustomers[0] || null;
  const currentStats = selectedCustomer ? (customerStats[selectedCustomer.id] || { orderCount: 0, totalSpent: 0, totalBalanceDue: 0, orders: [] }) : null;

  // Selected Customer Logs
  const customerLogs = useMemo(() => {
    if (!selectedCustomer) return [];
    return (store.customerLogs || []).filter((l) => l.customerId === selectedCustomer.id);
  }, [store.customerLogs, selectedCustomer]);

  // Unique Tags for Filter Bar
  const allTags = useMemo(() => {
    const set = new Set();
    (store.customers || []).forEach((c) => {
      if (Array.isArray(c.tags)) c.tags.forEach((t) => set.add(t));
    });
    return Array.from(set);
  }, [store.customers]);

  // Open Edit Modal
  const handleOpenEdit = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setCustomerForm({
        name: customer.name || '',
        identification: customer.identification || '',
        phone: customer.phone || '',
        email: customer.email || '',
        city: customer.city || 'Milagro',
        address: customer.address || '',
        companyName: customer.companyName || '',
        isVip: Boolean(customer.isVip),
        creditLimit: customer.creditLimit || 0,
        creditDays: customer.creditDays || 0,
        tags: Array.isArray(customer.tags) ? customer.tags.join(', ') : 'General',
        notes: customer.notes || ''
      });
    } else {
      setEditingCustomer(null);
      setCustomerForm({
        name: '',
        identification: '',
        phone: '',
        email: '',
        city: 'Milagro',
        address: '',
        companyName: '',
        isVip: false,
        creditLimit: 0,
        creditDays: 0,
        tags: 'General',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  // Save Customer
  const handleSaveCustomer = (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      toast.warning('El nombre del cliente es obligatorio');
      return;
    }

    const tagsArray = customerForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const payload = {
      ...(editingCustomer ? { id: editingCustomer.id } : {}),
      name: customerForm.name.trim(),
      identification: customerForm.identification.trim(),
      phone: customerForm.phone.trim(),
      email: customerForm.email.trim(),
      city: customerForm.city.trim(),
      address: customerForm.address.trim(),
      companyName: customerForm.companyName.trim(),
      isVip: customerForm.isVip,
      creditLimit: Number(customerForm.creditLimit) || 0,
      creditDays: Number(customerForm.creditDays) || 0,
      tags: tagsArray.length > 0 ? tagsArray : ['General'],
      notes: customerForm.notes.trim()
    };

    const res = upsertCustomer(store, payload);
    if (res.ok) {
      onStoreUpdate(res.updatedStore);
      setIsModalOpen(false);
      setSelectedCustomerId(res.customer.id);
      toast.success(editingCustomer ? 'Cliente actualizado con éxito' : 'Cliente registrado en CRM');
    }
  };

  // Delete Customer
  const handleDeleteCustomer = (customerId) => {
    if (!confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) return;
    const res = deleteCustomer(store, customerId);
    if (!res.ok) {
      toast.error(res.error || 'No se pudo eliminar el cliente.');
      return;
    }
    onStoreUpdate(res.updatedStore);
    setSelectedCustomerId(null);
    toast.success('Cliente eliminado correctamente');
  };

  // Save Activity Log
  const handleSaveActivity = (e) => {
    e.preventDefault();
    if (!activityForm.description.trim()) {
      toast.warning('La descripción de la interacción es obligatoria.');
      return;
    }

    const res = logCustomerActivity(store, {
      customerId: selectedCustomer.id,
      activityType: activityForm.activityType,
      title: activityForm.title.trim() || `Interacción ${activityForm.activityType}`,
      description: activityForm.description.trim()
    });

    if (res.ok) {
      onStoreUpdate(res.updatedStore);
      setIsActivityModalOpen(false);
      setActivityForm({ activityType: 'whatsapp', title: '', description: '' });
      toast.success('Interacción registrada en la bitácora del cliente');
    }
  };

  // WhatsApp Dynamic Template Generator
  const getWhatsAppTemplates = (cust, stats) => {
    const lastOrd = stats?.orders?.[0];
    const orderNum = lastOrd?.orderNumber || '0000';
    const jobTitle = lastOrd?.jobName || 'tu proyecto de impresión';
    const balance = (stats?.totalBalanceDue || 0).toFixed(2);
    const proofUrl = `${window.location.origin}${window.location.pathname}#/prueba-arte/${lastOrd?.trackingToken || lastOrd?.id || ''}`;

    return [
      {
        key: 'ready',
        title: '🎉 Pedido Listo para Retiro',
        text: `¡Hola *${cust?.name}*! 👋 Te informamos que tu trabajo *${jobTitle}* (Orden #${orderNum}) está 100% terminado y listo para retiro en el taller de *Gigaprint*. ¡Te esperamos!`
      },
      {
        key: 'proof',
        title: '🎨 Solicitud de Aprobación de Boceto',
        text: `¡Hola *${cust?.name}*! 🎨 Adjuntamos el boceto de tu trabajo *${jobTitle}* para revisión.\nPuedes verificar medidas y firmar la aprobación aquí: ${proofUrl}\n¡Esperamos tu confirmación para imprimir!`
      },
      {
        key: 'collection',
        title: '💳 Recordatorio de Saldo Pendiente',
        text: `Estimado/a *${cust?.name}*, le saludamos cordialmente de *Gigaprint*. Le recordamos que mantiene un saldo pendiente de *$${balance}* por sus trabajos recientes. ¿Podría confirmarnos la fecha estimada de pago? ¡Gracias!`
      },
      {
        key: 'promo',
        title: '🚀 Promoción & Reactivación Mensual',
        text: `¡Hola *${cust?.name}*! En *Gigaprint* tenemos tarifas preferenciales para tu empresa *${cust?.companyName || cust?.name}* en vinil adhesivo, lonas y rótulos luminosos. ¿Te gustaría cotizar tu próxima campaña publicitaria?`
      },
      {
        key: 'general',
        title: '💬 Asesoría General / Saludo',
        text: `¡Hola *${cust?.name}*! Te saluda el equipo de asesoría de *Gigaprint*. ¿En qué proyecto publicitario o de señalética te podemos colaborar hoy?`
      }
    ];
  };

  const handleOpenWhatsAppModal = (cust) => {
    if (!cust?.phone) {
      toast.warning('El cliente no tiene teléfono registrado para enviar WhatsApp.');
      return;
    }
    const templates = getWhatsAppTemplates(cust, currentStats);
    setSelectedTemplateKey('ready');
    setCustomWhatsAppMsg(templates[0].text);
    setIsWhatsAppModalOpen(true);
  };

  const handleSendCustomWhatsApp = () => {
    if (!selectedCustomer?.phone) return;
    let cleanPhone = selectedCustomer.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = `593${cleanPhone.substring(1)}`;
    if (!cleanPhone.startsWith('593')) cleanPhone = `593${cleanPhone}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(customWhatsAppMsg)}`, '_blank');
    setIsWhatsAppModalOpen(false);
  };

  return (
    <div className="pos-crm-container" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '20px' }}>
      {/* Left Column: Customer Directory */}
      <div className="pos-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: 'calc(100vh - 180px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} style={{ color: 'var(--orange)' }} />
            Directorio Clientes ({store.customers?.length || 0})
          </h2>
          <button
            type="button"
            className="pos-submit-order-btn"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => handleOpenEdit(null)}
          >
            <Plus size={15} /> Nuevo
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--muted)' }} />
          <input
            type="text"
            className="pos-input"
            placeholder="Buscar por Nombre, RUC, Teléfono o Empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        {/* Tag Filters */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            type="button"
            onClick={() => setFilterTag('all')}
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              border: '1px solid var(--line)',
              background: filterTag === 'all' ? 'var(--orange-soft)' : 'var(--bg)',
              color: filterTag === 'all' ? 'var(--orange-dark)' : 'var(--muted)',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Todos
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTag(t)}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: '1px solid var(--line)',
                background: filterTag === t ? 'var(--orange-soft)' : 'var(--bg)',
                color: filterTag === t ? 'var(--orange-dark)' : 'var(--muted)',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Customer Cards */}
        <div style={{ display: 'grid', gap: '8px' }}>
          {filteredCustomers.map((cust) => {
            const stats = customerStats[cust.id] || { orderCount: 0, totalSpent: 0, totalBalanceDue: 0 };
            const isSelected = selectedCustomer?.id === cust.id;

            return (
              <div
                key={cust.id}
                onClick={() => setSelectedCustomerId(cust.id)}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  border: isSelected ? '2px solid var(--orange)' : '1px solid var(--line)',
                  background: isSelected ? 'var(--orange-soft)' : 'var(--bg)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'grid',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{cust.name}</strong>
                    {cust.isVip && <Star size={13} fill="#f59e0b" color="#f59e0b" />}
                  </div>
                  {stats.totalBalanceDue > 0 ? (
                    <span style={{ fontSize: '10px', fontWeight: 900, padding: '2px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626' }}>
                      Debe: ${stats.totalBalanceDue.toFixed(2)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange-dark)' }}>
                      ${stats.totalSpent.toFixed(2)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>{cust.identification || cust.companyName || 'Sin RUC'}</span>
                  <span>{stats.orderCount} {stats.orderCount === 1 ? 'pedido' : 'pedidos'}</span>
                </div>

                {stats.isInactive && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={11} /> Sin compras hace &gt;30 días
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Customer 360 Profile & Tabs */}
      {selectedCustomer ? (
        <div style={{ display: 'grid', gap: '16px', height: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          {/* Header Profile Card */}
          <div className="pos-card" style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: 'var(--ink)' }}>
                    {selectedCustomer.name}
                  </h2>
                  {selectedCustomer.isVip && (
                    <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#fef3c7', color: '#b45309', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Star size={12} fill="#b45309" /> VIP
                    </span>
                  )}
                </div>
                {selectedCustomer.companyName && (
                  <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <Building2 size={14} /> {selectedCustomer.companyName}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(selectedCustomer)}
                  className="pos-nav-tab"
                  style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppModal(selectedCustomer)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Abrir selector de plantillas interactivas de WhatsApp"
                >
                  <MessageCircle size={15} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                  className="pos-nav-tab"
                  style={{ padding: '8px 12px', fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Eliminar cliente"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Contact & Credit Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg)', padding: '14px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>RUC / Cédula</span>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--ink)' }}>{selectedCustomer.identification || 'Sin documento'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Teléfono</span>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--ink)' }}>{selectedCustomer.phone || 'Sin teléfono'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Email</span>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>{selectedCustomer.email || 'Sin correo'}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Ciudad / Dirección</span>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>{selectedCustomer.city} {selectedCustomer.address ? `• ${selectedCustomer.address}` : ''}</div>
              </div>
            </div>

            {/* Credit Limit Gauge */}
            {selectedCustomer.creditLimit > 0 && (
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>
                  <span>Límite de Crédito ({selectedCustomer.creditDays || 15} días)</span>
                  <span style={{ color: currentStats.totalBalanceDue > selectedCustomer.creditLimit ? '#dc2626' : 'var(--ink)' }}>
                    ${currentStats.totalBalanceDue.toFixed(2)} de ${Number(selectedCustomer.creditLimit).toFixed(2)}
                  </span>
                </div>
                <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (currentStats.totalBalanceDue / selectedCustomer.creditLimit) * 100)}%`,
                      background: currentStats.totalBalanceDue > selectedCustomer.creditLimit ? '#dc2626' : (currentStats.totalBalanceDue > selectedCustomer.creditLimit * 0.7 ? '#f59e0b' : '#16a34a')
                    }}
                  />
                </div>
              </div>
            )}

            {/* Financial Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>LTV (Total Comprado)</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--orange)', fontFamily: 'Space Grotesk' }}>
                  ${(currentStats?.totalSpent || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>Saldo Pendiente</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: currentStats?.totalBalanceDue > 0 ? '#dc2626' : '#16a34a', fontFamily: 'Space Grotesk' }}>
                  ${(currentStats?.totalBalanceDue || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>Total Pedidos</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                  {currentStats?.orderCount || 0}
                </div>
              </div>
            </div>
          </div>

          {/* CRM Activity Timeline & Communications */}
          <div className="pos-card" style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={18} style={{ color: 'var(--orange)' }} />
                Bitácora de Seguimiento & CRM
              </h3>
              <button
                type="button"
                className="pos-submit-order-btn"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => setIsActivityModalOpen(true)}
              >
                <Plus size={14} /> Registrar Interacción
              </button>
            </div>

            {customerLogs.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
                No hay notas ni llamadas registradas para este cliente. Haz clic en "Registrar Interacción" para agregar una.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {customerLogs.map((log) => (
                  <div key={log.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--line)', display: 'grid', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>{log.title}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{log.createdAt?.split('T')[0]}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink)' }}>{log.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Orders Timeline with 1-Click Reorder */}
          <div className="pos-card" style={{ display: 'grid', gap: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={18} style={{ color: 'var(--orange)' }} />
              Historial de Trabajos & Reorden Rápido
            </h3>

            {currentStats?.orders?.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
                Este cliente no tiene pedidos registrados aún.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {currentStats.orders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      padding: '14px',
                      borderRadius: '12px',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>Orden #{ord.orderNumber}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{ord.orderDate}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange-dark)' }}>{ord.productionStage}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 600, marginTop: '2px' }}>
                        {ord.jobName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Total: <b>${Number(ord.totalAmount).toFixed(2)}</b> • Saldo: <b style={{ color: ord.balanceDue > 0 ? '#dc2626' : '#16a34a' }}>${Number(ord.balanceDue).toFixed(2)}</b>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="pos-submit-order-btn"
                      style={{ padding: '6px 14px', fontSize: '12px' }}
                      onClick={() => {
                        const cloned = clonePOSOrder(store, ord.id);
                        if (cloned && onReorder) {
                          onReorder(cloned);
                        }
                      }}
                    >
                      <RotateCcw size={14} /> Reordenar (1-Clic)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pos-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <p style={{ color: 'var(--muted)' }}>Selecciona un cliente del directorio para ver su ficha 360°</p>
        </div>
      )}

      {/* MODAL: CREATE / EDIT CUSTOMER */}
      {isModalOpen && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
                {editingCustomer ? 'Editar Ficha de Cliente' : 'Nuevo Cliente CRM'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Nombre o Contacto *</label>
                  <input
                    type="text"
                    className="pos-input"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>RUC o Cédula</label>
                  <input
                    type="text"
                    className="pos-input"
                    value={customerForm.identification}
                    onChange={(e) => setCustomerForm({ ...customerForm, identification: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Empresa / Razón Social</label>
                  <input
                    type="text"
                    className="pos-input"
                    value={customerForm.companyName}
                    onChange={(e) => setCustomerForm({ ...customerForm, companyName: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Teléfono WhatsApp *</label>
                  <input
                    type="text"
                    className="pos-input"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="099..."
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Correo Electrónico</label>
                  <input
                    type="email"
                    className="pos-input"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Ciudad</label>
                  <input
                    type="text"
                    className="pos-input"
                    value={customerForm.city}
                    onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Dirección de Entrega / Matriz</label>
                <input
                  type="text"
                  className="pos-input"
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Límite de Crédito ($)</label>
                  <input
                    type="number"
                    className="pos-input"
                    value={customerForm.creditLimit}
                    onChange={(e) => setCustomerForm({ ...customerForm, creditLimit: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800 }}>Días de Crédito</label>
                  <select
                    className="pos-select"
                    value={customerForm.creditDays}
                    onChange={(e) => setCustomerForm({ ...customerForm, creditDays: Number(e.target.value) })}
                  >
                    <option value={0}>0 (Contado)</option>
                    <option value={8}>8 días</option>
                    <option value={15}>15 días</option>
                    <option value={30}>30 días</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '22px' }}>
                  <input
                    type="checkbox"
                    id="vipCheck"
                    checked={customerForm.isVip}
                    onChange={(e) => setCustomerForm({ ...customerForm, isVip: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--orange)' }}
                  />
                  <label htmlFor="vipCheck" style={{ fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                    Cliente VIP ⭐
                  </label>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Etiquetas (separadas por coma)</label>
                <input
                  type="text"
                  className="pos-input"
                  value={customerForm.tags}
                  onChange={(e) => setCustomerForm({ ...customerForm, tags: e.target.value })}
                  placeholder="Empresarial, Factura, Gran Formato"
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Notas Internas / Preferencias</label>
                <textarea
                  className="pos-textarea"
                  rows={3}
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="Especificaciones de acabados, horarios de atención, etc."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="pos-nav-tab" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="pos-submit-order-btn">
                  <Save size={16} /> Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ACTIVITY LOG */}
      {isActivityModalOpen && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Registrar Actividad CRM</h2>
              <button type="button" onClick={() => setIsActivityModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveActivity} style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Tipo de Interacción</label>
                <select
                  className="pos-input"
                  value={activityForm.activityType}
                  onChange={(e) => setActivityForm({ ...activityForm, activityType: e.target.value })}
                >
                  <option value="whatsapp">📱 Mensaje de WhatsApp</option>
                  <option value="call">📞 Llamada Telefónica</option>
                  <option value="visit">🏢 Visita Presencial</option>
                  <option value="email">✉️ Correo Electrónico</option>
                  <option value="note">📝 Nota Interna</option>
                  <option value="payment_reminder">💵 Recordatorio de Cobro</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Título / Asunto</label>
                <input
                  type="text"
                  className="pos-input"
                  value={activityForm.title}
                  onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  placeholder="Ej. Envío de cotización de letras 3D"
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Descripción / Acuerdos *</label>
                <textarea
                  className="pos-input"
                  rows={4}
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  placeholder="Detalle de lo conversado con el cliente..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="pos-nav-tab" onClick={() => setIsActivityModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="pos-submit-order-btn">
                  <Save size={16} /> Guardar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic WhatsApp Template Picker Modal */}
      {isWhatsAppModalOpen && selectedCustomer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--paper)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '520px',
            width: '100%',
            border: '1px solid var(--line)',
            display: 'grid',
            gap: '14px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#dcfce7', padding: '6px', borderRadius: '8px', color: '#16a34a' }}>
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>
                    Plantillas WhatsApp — {selectedCustomer.name}
                  </h3>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    📱 {selectedCustomer.phone || 'Sin número'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatsAppModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Template Selection Chips */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '6px' }}>
                Selecciona una plantilla predefinida:
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {getWhatsAppTemplates(selectedCustomer, currentStats).map((tmpl) => (
                  <button
                    key={tmpl.key}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateKey(tmpl.key);
                      setCustomWhatsAppMsg(tmpl.text);
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: `1.5px solid ${selectedTemplateKey === tmpl.key ? '#16a34a' : 'var(--line)'}`,
                      background: selectedTemplateKey === tmpl.key ? '#dcfce7' : 'var(--bg)',
                      color: selectedTemplateKey === tmpl.key ? '#166534' : 'var(--ink)',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {tmpl.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Message Text Area */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                Mensaje a Enviar (Puedes editar o personalizar el texto):
              </label>
              <textarea
                className="pos-textarea"
                rows={5}
                value={customWhatsAppMsg}
                onChange={(e) => setCustomWhatsAppMsg(e.target.value)}
                style={{ fontSize: '13px', lineHeight: 1.4 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="pos-cat-pill"
                onClick={() => setIsWhatsAppModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendCustomWhatsApp}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#25D366',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <MessageCircle size={16} /> Abrir WhatsApp & Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
