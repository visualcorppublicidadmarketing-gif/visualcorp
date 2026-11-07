import React from 'react';
import { Check, ClipboardList, ShoppingBag, Wallet } from 'lucide-react';

export type POSCheckoutStep = 'order' | 'details' | 'payment';

const steps: { id: POSCheckoutStep; title: string; hint: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'order', title: 'Pedido y cliente', hint: 'Artículos y sucursal', icon: ShoppingBag },
  { id: 'details', title: 'Detalles del trabajo', hint: 'Producción y entrega', icon: ClipboardList },
  { id: 'payment', title: 'Cobro y confirmación', hint: 'Revisa antes de guardar', icon: Wallet },
];

export function POSCheckoutSteps({
  active,
  onChange,
  itemCount = 0,
  requiresDetails = false,
}: {
  active: POSCheckoutStep;
  onChange: (step: POSCheckoutStep) => void;
  itemCount?: number;
  requiresDetails?: boolean;
}) {
  const activeIndex = steps.findIndex((step) => step.id === active);
  return <nav className="pos-checkout-steps" aria-label="Etapas de la venta">
    {steps.map((step, index) => {
      const isComplete = index < activeIndex;
      const isActive = active === step.id;
      const Icon = step.icon;
      const dynamicHint = step.id === 'order' && itemCount > 0
        ? `${itemCount} ${itemCount === 1 ? 'artículo listo' : 'artículos listos'}`
        : step.id === 'details' && requiresDetails
          ? 'Ruta / entrega requerida'
          : step.hint;
      return <button
        key={step.id}
        type="button"
        className={`pos-checkout-step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
        aria-current={isActive ? 'step' : undefined}
        onClick={() => onChange(step.id)}
      >
        <span className="pos-checkout-step-number">
          {isComplete ? <Check size={13} aria-hidden="true"/> : index + 1}
        </span>
        <span>
          <strong><Icon size={12} aria-hidden="true"/> {step.title}</strong>
          <small>{dynamicHint}</small>
        </span>
      </button>;
    })}
  </nav>;
}
