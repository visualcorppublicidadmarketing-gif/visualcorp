import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Copy,
  CalendarDays,
  Sparkles,
  Eye,
  Info
} from 'lucide-react';
import { DEFAULT_BUSINESS_SCHEDULE } from '../../../lib/scheduleEngine';
import { LiveScheduleWidget } from '../../../components/LiveScheduleWidget';

export function POSBusinessScheduleEditor({
  settings = {},
  onSaveSettings
}) {
  const currentSchedule = settings.businessSchedule || DEFAULT_BUSINESS_SCHEDULE;
  const [schedule, setSchedule] = useState(() => ({
    ...DEFAULT_BUSINESS_SCHEDULE,
    ...currentSchedule,
    days: {
      ...DEFAULT_BUSINESS_SCHEDULE.days,
      ...(currentSchedule.days || {})
    },
    holidays: Array.isArray(currentSchedule.holidays) ? currentSchedule.holidays : DEFAULT_BUSINESS_SCHEDULE.holidays
  }));

  const [savedSuccess, setSavedSuccess] = useState(false);

  // New Holiday Draft State
  const [newHolDate, setNewHolDate] = useState('');
  const [newHolName, setNewHolName] = useState('');
  const [newHolIsOpen, setNewHolIsOpen] = useState(false);
  const [newHolOpen, setNewHolOpen] = useState('09:00');
  const [newHolClose, setNewHolClose] = useState('13:00');
  const [newHolNote, setNewHolNote] = useState('');

  // Handle Day Update
  const updateDay = (dayId, patch) => {
    setSchedule((prev) => ({
      ...prev,
      days: {
        ...prev.days,
        [dayId]: {
          ...prev.days[dayId],
          ...patch
        }
      }
    }));
    setSavedSuccess(false);
  };

  // Copy Tuesday schedule to Wednesday-Friday
  const copyTuesdayToFriday = () => {
    const tue = schedule.days[2] || { open: '08:30', close: '18:00', isOpen: true, note: 'Jornada continua' };
    setSchedule((prev) => {
      const nextDays = { ...prev.days };
      [3, 4, 5].forEach((d) => {
        nextDays[d] = {
          ...nextDays[d],
          open: tue.open,
          close: tue.close,
          isOpen: tue.isOpen,
          note: tue.note
        };
      });
      return { ...prev, days: nextDays };
    });
  };

  // Add Holiday
  const handleAddHoliday = (e) => {
    e.preventDefault();
    if (!newHolDate || !newHolName) return;

    const newHol = {
      id: `hol-${Date.now()}`,
      date: newHolDate,
      name: newHolName,
      isOpen: newHolIsOpen,
      open: newHolIsOpen ? newHolOpen : '',
      close: newHolIsOpen ? newHolClose : '',
      note: newHolNote || (newHolIsOpen ? 'Horario especial de feriado' : 'Cerrado por feriado')
    };

    setSchedule((prev) => ({
      ...prev,
      holidays: [...prev.holidays, newHol].sort((a, b) => a.date.localeCompare(b.date))
    }));

    setNewHolDate('');
    setNewHolName('');
    setNewHolNote('');
    setSavedSuccess(false);
  };

  // Remove Holiday
  const handleRemoveHoliday = (holId) => {
    setSchedule((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((h) => h.id !== holId)
    }));
    setSavedSuccess(false);
  };

  // Save Schedule
  const handleSave = () => {
    if (onSaveSettings) {
      onSaveSettings({
        ...settings,
        businessSchedule: schedule
      });
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Reset to Defaults
  const handleResetDefaults = () => {
    if (window.confirm('¿Deseas restablecer el horario sugerido de Gigaprint?')) {
      setSchedule(DEFAULT_BUSINESS_SCHEDULE);
      setSavedSuccess(false);
    }
  };

  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow orange" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Clock size={13} /> Configuración en Vivo
          </span>
          <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>
            Horario de Atención, Feriados y Estados en Tiempo Real
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
            Define las horas de apertura, días de descanso y excepciones de feriados. La página web y el mostrador se actualizan automáticamente en vivo.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="button button-ghost compact"
            onClick={handleResetDefaults}
            style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RotateCcw size={14} /> Valores sugeridos
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleSave}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px' }}
          >
            {savedSuccess ? <Check size={16} /> : <Save size={16} />}
            {savedSuccess ? '¡Horario Guardado!' : 'Guardar Horario'}
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout (Config Left, Live Preview Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: '20px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: EDITORS */}
        <div style={{ display: 'grid', gap: '18px' }}>
          
          {/* SECTION 1: WEEKLY RECURRING SCHEDULE */}
          <div className="pos-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <div>
                <strong style={{ fontSize: '15px', color: 'var(--ink)', display: 'block' }}>
                  🗓️ Horario Semanal Recurrente
                </strong>
                <small style={{ color: 'var(--muted)', fontSize: '11.5px' }}>Configura los horarios habituales de lunes a domingo</small>
              </div>

              <button
                type="button"
                onClick={copyTuesdayToFriday}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Aplica el horario del Martes a Miércoles, Jueves y Viernes"
              >
                <Copy size={12} /> Copiar Mar a Vie
              </button>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              {dayOrder.map((dayIdx) => {
                const day = schedule.days[dayIdx] || DEFAULT_BUSINESS_SCHEDULE.days[dayIdx];
                return (
                  <div
                    key={dayIdx}
                    style={{
                      background: day.isOpen ? '#ffffff' : '#f8fafc',
                      border: day.isOpen ? '1.5px solid var(--line)' : '1px dashed #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    {/* Toggle and Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '130px' }}>
                      <input
                        type="checkbox"
                        id={`day-open-${dayIdx}`}
                        checked={Boolean(day.isOpen)}
                        onChange={(e) => updateDay(dayIdx, { isOpen: e.target.checked })}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--orange)', cursor: 'pointer' }}
                      />
                      <label htmlFor={`day-open-${dayIdx}`} style={{ fontWeight: 800, fontSize: '13.5px', color: day.isOpen ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer' }}>
                        {day.name}
                      </label>
                    </div>

                    {/* Time Inputs */}
                    {day.isOpen ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Abre:</span>
                          <input
                            type="time"
                            className="pos-input"
                            value={day.open}
                            onChange={(e) => updateDay(dayIdx, { open: e.target.value })}
                            style={{ padding: '4px 8px', fontSize: '12px', width: '105px' }}
                          />
                        </div>

                        <span style={{ color: 'var(--muted)', fontWeight: 800 }}>—</span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Cierra:</span>
                          <input
                            type="time"
                            className="pos-input"
                            value={day.close}
                            onChange={(e) => updateDay(dayIdx, { close: e.target.value })}
                            style={{ padding: '4px 8px', fontSize: '12px', width: '105px' }}
                          />
                        </div>

                        <input
                          type="text"
                          className="pos-input"
                          placeholder="Nota (ej. Jornada continua)"
                          value={day.note || ''}
                          onChange={(e) => updateDay(dayIdx, { note: e.target.value })}
                          style={{ padding: '4px 8px', fontSize: '11.5px', width: '160px' }}
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700, background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>
                          Cerrado
                        </span>
                        <input
                          type="text"
                          className="pos-input"
                          placeholder="Nota (ej. Solo citas / WhatsApp)"
                          value={day.note || ''}
                          onChange={(e) => updateDay(dayIdx, { note: e.target.value })}
                          style={{ padding: '4px 8px', fontSize: '11.5px', width: '190px' }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: HOLIDAYS & SPECIAL DATE EXCEPTIONS */}
          <div className="pos-card" style={{ padding: '18px 20px' }}>
            <div style={{ marginBottom: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
              <strong style={{ fontSize: '15px', color: 'var(--ink)', display: 'block' }}>
                🏖️ Feriados y Fechas Especiales del Calendario
              </strong>
              <small style={{ color: 'var(--muted)', fontSize: '11.5px' }}>
                Establece días festivos o con horario reducido que anulan el horario regular
              </small>
            </div>

            {/* Add Holiday Form */}
            <form onSubmit={handleAddHoliday} style={{
              background: '#f8fafc',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'grid',
              gap: '10px',
              marginBottom: '14px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--orange-dark)' }}>
                + Programar Nuevo Feriado / Excepción
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div>
                  <label className="pos-label required">Fecha</label>
                  <input
                    type="date"
                    className="pos-input"
                    value={newHolDate}
                    onChange={(e) => setNewHolDate(e.target.value)}
                    required
                    style={{ fontSize: '12px', padding: '6px 8px' }}
                  />
                </div>

                <div>
                  <label className="pos-label required">Motivo / Nombre</label>
                  <input
                    type="text"
                    className="pos-input"
                    placeholder="Ej. Batalla de Pichincha"
                    value={newHolName}
                    onChange={(e) => setNewHolName(e.target.value)}
                    required
                    style={{ fontSize: '12px', padding: '6px 8px' }}
                  />
                </div>

                <div>
                  <label className="pos-label">Modalidad</label>
                  <select
                    className="pos-select"
                    value={newHolIsOpen ? 'open' : 'closed'}
                    onChange={(e) => setNewHolIsOpen(e.target.value === 'open')}
                    style={{ fontSize: '12px', padding: '6px 8px' }}
                  >
                    <option value="closed">⛔ Cerrado todo el día</option>
                    <option value="open">⏰ Horario especial</option>
                  </select>
                </div>
              </div>

              {newHolIsOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '10px' }}>
                  <div>
                    <label className="pos-label">Hora Apertura</label>
                    <input
                      type="time"
                      className="pos-input"
                      value={newHolOpen}
                      onChange={(e) => setNewHolOpen(e.target.value)}
                      style={{ fontSize: '12px', padding: '5px' }}
                    />
                  </div>
                  <div>
                    <label className="pos-label">Hora Cierre</label>
                    <input
                      type="time"
                      className="pos-input"
                      value={newHolClose}
                      onChange={(e) => setNewHolClose(e.target.value)}
                      style={{ fontSize: '12px', padding: '5px' }}
                    />
                  </div>
                  <div>
                    <label className="pos-label">Nota Especial</label>
                    <input
                      type="text"
                      className="pos-input"
                      placeholder="Ej. Atención hasta el mediodía"
                      value={newHolNote}
                      onChange={(e) => setNewHolNote(e.target.value)}
                      style={{ fontSize: '12px', padding: '5px' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="button button-primary compact"
                  style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Plus size={14} /> Añadir Feriado a la Lista
                </button>
              </div>
            </form>

            {/* List of active holidays */}
            <div style={{ display: 'grid', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
              {schedule.holidays.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>
                  No hay feriados programados.
                </div>
              ) : (
                schedule.holidays.map((hol) => (
                  <div
                    key={hol.id}
                    style={{
                      background: hol.isOpen ? '#eff6ff' : '#fef2f2',
                      border: hol.isOpen ? '1px solid #bfdbfe' : '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 900, fontFamily: 'Space Grotesk, monospace', color: hol.isOpen ? '#1e40af' : '#991b1b' }}>
                        📅 {hol.date}
                      </span>
                      <strong style={{ color: 'var(--ink)' }}>{hol.name}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        ({hol.isOpen ? `Horario: ${hol.open} - ${hol.close}` : 'Cerrado'})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveHoliday(hol.id)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px 4px' }}
                      title="Eliminar feriado"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE PREVIEW & MESSAGES */}
        <div style={{ display: 'grid', gap: '16px', position: 'sticky', top: '20px' }}>
          
          {/* Live Preview Card */}
          <div className="pos-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Eye size={16} style={{ color: 'var(--orange)' }} />
              <strong style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                Vista Previa en Vivo (Cliente)
              </strong>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--muted)' }}>
              Así se ve el horario en la página pública de Contacto con cálculo en tiempo real:
            </p>

            <LiveScheduleWidget
              schedule={schedule}
              phone={settings.phone}
              whatsapp={settings.whatsapp}
              address={settings.address}
            />
          </div>

          {/* Emergency & Off-hours WhatsApp Text */}
          <div className="pos-card" style={{ padding: '16px 20px' }}>
            <strong style={{ fontSize: '13.5px', color: 'var(--ink)', display: 'block', marginBottom: '8px' }}>
              💬 Mensaje Fuera de Horario
            </strong>
            <label className="pos-label">Texto predeterminado para WhatsApp:</label>
            <textarea
              className="pos-input"
              rows={3}
              value={schedule.emergencyWhatsAppText || ''}
              onChange={(e) => setSchedule((prev) => ({ ...prev, emergencyWhatsAppText: e.target.value }))}
              placeholder="Mensaje que enviará el cliente fuera de horario laboral..."
              style={{ fontSize: '12px' }}
            />
          </div>

        </div>

      </div>
    </div>
  );
}
