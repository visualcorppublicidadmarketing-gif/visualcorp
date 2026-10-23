import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Sparkles,
  Info,
  CalendarDays,
  MapPin,
  Flame,
  ShieldAlert
} from 'lucide-react';
import { calculateLiveScheduleStatus, DEFAULT_BUSINESS_SCHEDULE, formatTime12h } from '../lib/scheduleEngine';

export function LiveScheduleWidget({
  schedule = DEFAULT_BUSINESS_SCHEDULE,
  phone = '+593 98 765 4321',
  whatsapp = '593987654321',
  address = 'Av. García Moreno y 9 de Octubre, Milagro, Guayas',
  compact = false
}) {
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);

  // Live timer clock ticking every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const live = useMemo(() => {
    return calculateLiveScheduleStatus(schedule, now);
  }, [schedule, now]);

  const whatsappMessage = useMemo(() => {
    if (live.status === 'open' || live.status === 'closing_soon') {
      return encodeURIComponent('Hola Gigaprint, me comunico en su horario de atención para consultar una cotización.');
    }
    return encodeURIComponent(live.emergencyWhatsAppText || 'Hola Gigaprint, les escribo fuera de horario para coordinar una cotización urgente.');
  }, [live]);

  // If compact mode is requested (e.g. for header or footer badge)
  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: '#fff',
        border: `1px solid ${live.badgeColor}`,
        padding: '3px 9px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 800,
        color: 'var(--ink)'
      }}>
        <span style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: live.badgeColor,
          display: 'inline-block',
          boxShadow: `0 0 6px ${live.badgeColor}`
        }} />
        <span>{live.badgeLabel}</span>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({live.todayHoursStr})</span>
      </div>
    );
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1.5px solid var(--line)',
      borderRadius: '16px',
      padding: '16px 18px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      display: 'grid',
      gap: '12px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Top Header: Live Status & Realtime Clock */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Pulsing live beacon dot */}
            <span style={{ position: 'relative', display: 'flex', width: '10px', height: '10px' }}>
              <span style={{
                position: 'absolute',
                display: 'inline-flex',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: live.badgeColor,
                opacity: 0.6,
                animation: 'pos-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
              }} />
              <span style={{
                position: 'relative',
                display: 'inline-flex',
                borderRadius: '50%',
                width: '10px',
                height: '10px',
                background: live.badgeColor
              }} />
            </span>

            <span style={{
              background: `${live.badgeColor}15`,
              color: live.badgeColor,
              border: `1px solid ${live.badgeColor}40`,
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.02em'
            }}>
              {live.badgeLabel}
            </span>

            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700 }}>
              · {live.currentDayName}
            </span>
          </div>

          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginTop: '4px' }}>
            {live.statusMessage}
          </div>
        </div>

        {/* Live Digital Clock Badge */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'Space Grotesk, monospace'
        }}>
          <Clock size={13} style={{ color: 'var(--orange)' }} />
          <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--ink)' }}>
            {live.currentTimeStr}
            <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: '2px' }}>
              :{live.currentSecondsStr}
            </span>
          </span>
        </div>
      </div>

      {/* Next opening info if currently closed */}
      {(live.status === 'closed' || live.status === 'holiday') && live.nextOpenInfo && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#1e40af',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Calendar size={15} style={{ flexShrink: 0, color: '#2563eb' }} />
          <span>
            Próxima apertura presencial: <strong>{live.nextOpenInfo.message}</strong>
          </span>
        </div>
      )}

      {/* Holiday Alert Banner if applicable */}
      {live.isHoliday && (
        <div style={{
          background: '#fdf4ff',
          border: '1px solid #f0abfc',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          color: '#86198f',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Sparkles size={15} style={{ flexShrink: 0, color: '#c026d3' }} />
          <span>
            <strong>Feriado Oficial:</strong> {live.holidayName} · {live.statusMessage}
          </span>
        </div>
      )}

      {/* Weekly Schedule Table (Collapsible Accordion) */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '2px 0',
            fontSize: '12.5px',
            fontWeight: 800,
            color: 'var(--ink)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CalendarDays size={14} style={{ color: 'var(--orange)' }} />
            Ver horario de toda la semana
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted)' }}>
            {expanded ? 'Ocultar' : 'Desplegar'}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {expanded && (
          <div style={{
            display: 'grid',
            gap: '5px',
            marginTop: '10px',
            background: '#fafafa',
            borderRadius: '10px',
            padding: '8px 10px',
            border: '1px solid var(--line)'
          }}>
            {live.weeklyScheduleList.map((day) => {
              return (
                <div
                  key={day.dayIndex}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    background: day.isToday ? '#fff1e8' : 'transparent',
                    border: day.isToday ? '1px solid var(--orange)' : 'none',
                    fontWeight: day.isToday ? 900 : 600,
                    fontSize: '11.5px',
                    color: day.isToday ? 'var(--orange-dark)' : 'var(--ink)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{day.name}</span>
                    {day.isToday && (
                      <span style={{
                        background: 'var(--orange)',
                        color: '#fff',
                        fontSize: '9px',
                        fontWeight: 900,
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}>
                        HOY
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      color: day.isOpen ? (day.isToday ? 'var(--orange-dark)' : 'var(--ink)') : 'var(--muted)',
                      fontFamily: day.isOpen ? 'Space Grotesk, monospace' : 'inherit'
                    }}>
                      {day.hours}
                    </span>
                    {day.note && (
                      <small style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 500 }}>
                        ({day.note})
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WhatsApp Call to Action Button */}
      <a
        href={`https://wa.me/${whatsapp}?text=${whatsappMessage}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          background: live.status === 'open' ? '#16a34a' : 'var(--orange)',
          color: '#ffffff',
          borderRadius: '10px',
          padding: '10px 14px',
          textDecoration: 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 800,
          boxShadow: live.status === 'open' ? '0 2px 8px rgba(22, 163, 74, 0.25)' : '0 2px 8px rgba(234, 88, 12, 0.25)',
          transition: 'transform 0.1s ease'
        }}
      >
        <MessageCircle size={16} />
        {live.status === 'open' ? 'Chatear por WhatsApp en Vivo' : 'Escribir por WhatsApp (Respondemos al abrir)'}
      </a>
    </div>
  );
}
