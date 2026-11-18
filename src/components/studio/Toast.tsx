import React, { createContext, useContext, useMemo } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastApi {
  success: (msg: React.ReactNode, dur?: number) => string | number;
  error: (msg: React.ReactNode, dur?: number) => string | number;
  info: (msg: React.ReactNode, dur?: number) => string | number;
  warning: (msg: React.ReactNode, dur?: number) => string | number;
}

const ToastContext = createContext<ToastApi | null>(null);

function resolveDurationOption(dur?: number) {
  if (dur === undefined) return undefined;
  return { duration: dur <= 0 ? Infinity : dur };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = useMemo<ToastApi>(
    () => ({
      success: (msg, dur) => sonnerToast.success(msg, resolveDurationOption(dur)),
      error: (msg, dur) => sonnerToast.error(msg, resolveDurationOption(dur)),
      info: (msg, dur) => sonnerToast.info(msg, resolveDurationOption(dur)),
      warning: (msg, dur) => sonnerToast.warning(msg, resolveDurationOption(dur)),
    }),
    []
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Toaster
        className="vc-glass-toaster"
        position="bottom-right"
        duration={3500}
        richColors
        closeButton
        icons={{
          success: <CheckCircle2 size={18} aria-hidden="true" />,
          error: <AlertCircle size={18} aria-hidden="true" />,
          warning: <AlertTriangle size={18} aria-hidden="true" />,
          info: <Info size={18} aria-hidden="true" />,
          close: <X size={14} aria-hidden="true" />,
        }}
        toastOptions={{
          closeButton: true,
          closeButtonAriaLabel: 'Cerrar notificación',
          style: {
            background: 'var(--glass-bg-strong)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(var(--glass-blur)) saturate(1.12)',
            WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.12)',
            boxShadow: 'var(--glass-shadow)',
            color: 'var(--glass-ink)',
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: () => '',
      error: () => '',
      info: () => '',
      warning: () => '',
    };
  }
  return context;
}
