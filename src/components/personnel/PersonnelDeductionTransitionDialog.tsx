import { useEffect, useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Send, ShieldCheck, XCircle } from 'lucide-react';
import { Dialog, DialogCallout, DialogKeyValueList } from '../ui/DialogSystem';
import { Button } from '../ui/OperationalKit';
import { DEDUCTION_STATUS_META, formatMoney, validateDeductionTransition } from './personnelDomain';
import type { DeductionStatus, PayrollDeduction } from './personnelTypes';

export interface DeductionTransitionPayload {
  authorizationReference: string;
  evidenceReference: string;
  payrollHandoffReference: string;
}

interface PersonnelDeductionTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deduction: PayrollDeduction | null;
  targetStatus: DeductionStatus | null;
  personName: string;
  saving: boolean;
  errorMessage: string;
  onConfirm: (payload: DeductionTransitionPayload) => Promise<void>;
}

export function PersonnelDeductionTransitionDialog({
  open,
  onOpenChange,
  deduction,
  targetStatus,
  personName,
  saving,
  errorMessage,
  onConfirm,
}: PersonnelDeductionTransitionDialogProps) {
  const formId = useId();
  const [authorizationReference, setAuthorizationReference] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [payrollHandoffReference, setPayrollHandoffReference] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open || !deduction) return;
    setLocalError('');
    setAuthorizationReference(deduction.authorization_reference || '');
    setEvidenceReference(deduction.evidence_reference || '');
    setPayrollHandoffReference(deduction.payroll_handoff_reference || '');
  }, [open, deduction, targetStatus]);

  if (!deduction || !targetStatus) return null;

  const isCancel = targetStatus === 'cancelled';
  const isAuthorize = targetStatus === 'authorized';
  const isHandoff = targetStatus === 'sent_to_payroll';
  const isApplied = targetStatus === 'applied_externally';

  const dialogTone = isCancel
    ? 'danger'
    : isApplied
      ? 'success'
      : isHandoff
        ? 'brand'
        : 'info';

  const title = isAuthorize
    ? 'Autorizar descuento con respaldo'
    : isHandoff
      ? 'Entregar descuento a nómina externa'
      : isApplied
        ? 'Confirmar aplicación en rol de pagos'
        : 'Anular solicitud de descuento';

  const icon = isAuthorize ? (
    <ShieldCheck size={18} />
  ) : isHandoff ? (
    <Send size={18} />
  ) : isApplied ? (
    <CheckCircle2 size={18} />
  ) : (
    <XCircle size={18} />
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    const check = validateDeductionTransition(deduction.status, targetStatus, {
      authorizationReference,
      evidenceReference,
      payrollHandoffReference,
    });
    if (check.ok === false) {
      setLocalError(check.message);
      return;
    }
    await onConfirm({
      authorizationReference: authorizationReference.trim(),
      evidenceReference: evidenceReference.trim(),
      payrollHandoffReference: payrollHandoffReference.trim(),
    });
  };

  const combinedError = localError || errorMessage;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      tone={dialogTone}
      role={isCancel ? 'alertdialog' : 'dialog'}
      icon={icon}
      eyebrow={`DEDUCCIÓN · ${DEDUCTION_STATUS_META[deduction.status].label.toUpperCase()} → ${DEDUCTION_STATUS_META[targetStatus].label.toUpperCase()}`}
      title={title}
      description={`Colaborador: ${personName}. Las referencias registradas quedan bloqueadas para auditoría en Supabase.`}
      busy={saving}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button type="submit" form={formId} variant={isCancel ? 'danger' : 'default'} disabled={saving}>
            {saving ? 'Registrando…' : title}
          </Button>
        </>
      }
    >
      <form id={formId} className="personnel-dialog-form" onSubmit={handleSubmit}>
        <DialogKeyValueList
          items={[
            { label: 'Concepto', value: deduction.description },
            { label: 'Período de nómina', value: deduction.payroll_period.slice(0, 7) },
            { label: 'Importe a descontar', value: formatMoney(deduction.amount, 'USD', { signedMinus: true }), tone: 'highlight' },
          ]}
        />

        {isAuthorize && (
          <div className="personnel-form-grid">
            <label className="personnel-span-2">
              <span>Referencia de autorización expresa del colaborador *</span>
              <input
                type="text"
                required
                maxLength={240}
                placeholder="Ej. Acta firmada #014 / Autorización WhatsApp 11-nov"
                value={authorizationReference}
                onChange={(event) => setAuthorizationReference(event.target.value)}
                data-autofocus
              />
            </label>
            <label className="personnel-span-2">
              <span>Referencia de evidencia documental *</span>
              <input
                type="text"
                required
                maxLength={240}
                placeholder="Ej. Comprobante anticipo #2026-11 / Registro reloj 42 min"
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
              />
            </label>
          </div>
        )}

        {isHandoff && (
          <>
            <DialogKeyValueList
              items={[
                { label: 'Autorización registrada', value: deduction.authorization_reference || '—' },
                { label: 'Evidencia registrada', value: deduction.evidence_reference || '—' },
              ]}
            />
            <div className="personnel-form-grid">
              <label className="personnel-span-2">
                <span>Referencia real de entrega al rol externo *</span>
                <input
                  type="text"
                  required
                  maxLength={240}
                  placeholder="Ej. Lote quincena 2026-11 · Correo enviado a Contabilidad"
                  value={payrollHandoffReference}
                  onChange={(event) => setPayrollHandoffReference(event.target.value)}
                  data-autofocus
                />
              </label>
            </div>
          </>
        )}

        {isApplied && (
          <DialogCallout tone="info">
            Se marcará como aplicada en nómina externa conservando intactas las referencias de autorización ({deduction.authorization_reference || '—'}) y entrega ({deduction.payroll_handoff_reference || '—'}).
          </DialogCallout>
        )}

        {isCancel && (
          <DialogCallout tone="warning">
            La solicitud quedará anulada permanentemente y no podrá volver a autorizarse ni incluirse en el resumen neto.
          </DialogCallout>
        )}

        {combinedError && (
          <div className="personnel-alert is-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{combinedError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
