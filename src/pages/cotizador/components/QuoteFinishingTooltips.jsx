import React, { useState } from 'react';
import { HelpCircle, X, Check, ShieldCheck, Sparkles, Scissors, Info } from 'lucide-react';

export const FINISHING_GUIDES = [
  {
    id: 'none',
    name: 'Estándar / Con margen blanco',
    icon: '📐',
    desc: 'Lona o material con demasía perimetral de 2 a 3 cm de margen blanco sin cortar.',
    recommendedFor: 'Ideal para tensar sobre bastidores de madera o hierro, estructuras tubulares o marcos donde el borde quedará oculto.'
  },
  {
    id: 'corte_al_ras',
    name: 'Corte al ras (Refilado de precisión)',
    icon: '✂️',
    desc: 'Corte recto milimétrico exactamente en la línea límite del arte gráfico.',
    recommendedFor: 'Recomendado para pegar sobre paneles lisos, vitrinas, cuadros acrílicos o colgar con cinta doble faz de alta resistencia.'
  },
  {
    id: 'small',
    name: 'Ojales Pequeños Niquelados (10 mm)',
    icon: '⭕',
    desc: 'Anillos metálicos niquelados antioxidantes de 10mm de diámetro interno.',
    recommendedFor: 'Uso en lonas de interior, banners promocionales y eventos temporales donde se usan abrazaderas plásticas (amarras) o piolas delgadas.'
  },
  {
    id: 'large',
    name: 'Ojales Grandes Reforzados (15 mm)',
    icon: '🔘',
    desc: 'Ojales industriales de alta resistencia con refuerzo perimetral para vientos fuertes.',
    recommendedFor: 'Imprescindible para vallas de exterior, letreros en terrazas o fachadas expuestas donde se usarán cables de acero o tensores de goma.'
  },
  {
    id: 'bolsillo',
    name: 'Bolsillo para Tubo (Vaina Superior/Inferior)',
    icon: '📜',
    desc: 'Dobladillo termosellado en los extremos superior e inferior con espacio hueco para insertar tubos o varillas.',
    recommendedFor: 'Perfecto para pasacalles, pancartas de desfile, pendones colgantes de techo y banderas donde se coloca un tubo con regatones dorados.'
  }
];

export function QuoteFinishingModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="quote-finishing-modal-overlay" onClick={onClose}>
      <div className="quote-finishing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Guía Visual de Acabados y Confección</h3>
            <p>Conoce las características técnicas de cada acabado para elegir el ideal para tu proyecto.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="finishing-cards-grid">
          {FINISHING_GUIDES.map((guide) => (
            <div key={guide.id} className="finishing-guide-card">
              <div className="guide-icon">{guide.icon}</div>
              <div className="guide-content">
                <h4>{guide.name}</h4>
                <p>{guide.desc}</p>
                <div className="guide-recommendation">
                  <Check size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <small>{guide.recommendedFor}</small>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="button button-primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

export function FinishingHelpButton({ onClick }) {
  return (
    <button
      type="button"
      className="finishing-help-btn"
      onClick={onClick}
      title="Ver guía visual y fotos de acabados"
    >
      <HelpCircle size={14} /> ¿Qué acabado elegir?
    </button>
  );
}
