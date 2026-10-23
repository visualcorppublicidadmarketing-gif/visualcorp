import React from 'react';
import { Clock, Zap, Flame, ShieldAlert } from 'lucide-react';

export const DELIVERY_SPEEDS = [
  {
    id: 'standard',
    label: 'Estándar (48-72h)',
    badge: 'Sin recargo',
    surchargePercent: 0,
    desc: '2 a 3 días laborables en taller. Ideal para planificación regular.',
    icon: Clock
  },
  {
    id: 'express',
    label: 'Express 24 Horas',
    badge: '+25% de recargo',
    surchargePercent: 25,
    desc: 'Prioridad alta. Entrega al siguiente día hábil listo para retiro o despacho.',
    icon: Zap
  },
  {
    id: 'same_day',
    label: 'Mismo Día (Urgente)',
    badge: '+50% de recargo',
    surchargePercent: 50,
    desc: 'Máquina asignada de inmediato. Retiro en pocas horas (pedidos antes de las 13:00).',
    icon: Flame
  }
];

export function DeliverySpeedSelector({
  value = 'standard',
  onChange,
  subtotalBase = 0
}) {
  return (
    <div className="delivery-speed-wrap">
      <div className="delivery-speed-head">
        <label>Tiempo de entrega y producción</label>
        <span>Monetiza la urgencia de tu pedido</span>
      </div>

      <div className="delivery-speed-grid">
        {DELIVERY_SPEEDS.map((speed) => {
          const Icon = speed.icon;
          const isSelected = value === speed.id;
          const surchargeVal = (subtotalBase * speed.surchargePercent) / 100;

          return (
            <button
              key={speed.id}
              type="button"
              className={`delivery-speed-card ${isSelected ? 'active' : ''}`}
              onClick={() => onChange(speed.id)}
            >
              <div className="speed-card-top">
                <div className="speed-card-icon">
                  <Icon size={16} />
                </div>
                <div className="speed-card-label">
                  <strong>{speed.label}</strong>
                  <span className={`speed-badge ${speed.id}`}>{speed.badge}</span>
                </div>
              </div>
              <p className="speed-card-desc">{speed.desc}</p>
              {speed.surchargePercent > 0 && surchargeVal > 0 && (
                <div className="speed-surcharge-preview">
                  Recargo: +${surchargeVal.toFixed(2)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
