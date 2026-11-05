import React from 'react';

export type POSCheckoutStep = 'order' | 'details' | 'payment';

const steps: { id: POSCheckoutStep; title: string; hint: string }[] = [
  { id: 'order', title: 'Pedido y cliente', hint: 'Artículos y sucursal' },
  { id: 'details', title: 'Detalles del trabajo', hint: 'Producción y entrega' },
  { id: 'payment', title: 'Cobro y confirmación', hint: 'Revisa antes de guardar' },
];

export function POSCheckoutSteps({ active, onChange }: { active: POSCheckoutStep; onChange: (step: POSCheckoutStep) => void }) {
  const activeIndex = steps.findIndex((step) => step.id === active);
  return <nav className="pos-checkout-steps" aria-label="Etapas de la venta">
    {steps.map((step, index) => <button
      key={step.id}
      type="button"
      className={`pos-checkout-step${active === step.id ? ' is-active' : ''}${index < activeIndex ? ' is-complete' : ''}`}
      aria-current={active === step.id ? 'step' : undefined}
      onClick={() => onChange(step.id)}
    >
      <span className="pos-checkout-step-number">{index + 1}</span>
      <span><strong>{step.title}</strong><small>{step.hint}</small></span>
    </button>)}
  </nav>;
}
