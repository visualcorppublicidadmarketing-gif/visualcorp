import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, BriefcaseBusiness, CalendarDays, CircleDollarSign, Plus, UserRoundX } from 'lucide-react';
import { ecuadorTodayIso, formatEcuadorDate } from './personnelDomain';
import type {
  PersonnelEmploymentCompensationStatus,
  PersonnelEmploymentCompensation,
  PersonnelEmploymentExitType,
  PersonnelEmploymentPeriod,
  PersonnelRecord,
} from './personnelTypes';

type EmploymentAction = 'exit' | 'rehire' | null;

const EXIT_TYPES: Array<{ value: PersonnelEmploymentExitType; label: string }> = [
  { value: 'resignation', label: 'Renuncia' },
  { value: 'dismissal', label: 'Despido' },
  { value: 'contract_end', label: 'Fin de contrato' },
  { value: 'mutual_agreement', label: 'Mutuo acuerdo' },
  { value: 'abandonment', label: 'Abandono del puesto' },
  { value: 'other', label: 'Otra salida' },
];

const EXIT_REASONS = [
  'Estudios',
  'Nuevo empleo',
  'Motivo personal',
  'Responsabilidades familiares',
  'Salud',
  'Fin de contrato',
  'Reestructuración',
  'No informado',
  'Otro',
];

const COMPENSATION_STATUS: Array<{ value: PersonnelEmploymentCompensationStatus; label: string }> = [
  { value: 'pending', label: 'Pendiente de registrar' },
  { value: 'with_compensation', label: 'Con remuneración / liquidación' },
  { value: 'without_compensation', label: 'Sin remuneración / liquidación' },
  { value: 'not_applicable', label: 'No aplica' },
];

const EXIT_TYPE_LABEL: Record<PersonnelEmploymentExitType, string> = {
  resignation: 'Renuncia',
  dismissal: 'Despido',
  contract_end: 'Fin de contrato',
  mutual_agreement: 'Mutuo acuerdo',
  abandonment: 'Abandono del puesto',
  other: 'Otra salida',
  legacy: 'Período migrado',
};

const COMPENSATION_STATUS_LABEL: Record<PersonnelEmploymentCompensationStatus, string> = {
  pending: 'Pago/liquidación pendiente',
  with_compensation: 'Con remuneración / liquidación',
  without_compensation: 'Sin remuneración / liquidación',
  not_applicable: 'No aplica',
};

interface PersonnelEmploymentHistoryPanelProps {
  selected: PersonnelRecord;
  periods: PersonnelEmploymentPeriod[];
  compensation: PersonnelEmploymentCompensation[];
  canEdit: boolean;
  canViewCompensation: boolean;
  canEditCompensation: boolean;
  saving: boolean;
  onClosePeriod: (values: {
    endDate: string;
    exitType: PersonnelEmploymentExitType;
    exitReason: string;
    compensationStatus: PersonnelEmploymentCompensationStatus;
    exitNotes: string;
  }) => Promise<boolean>;
  onRehire: (startDate: string) => Promise<boolean>;
}

export function PersonnelEmploymentHistoryPanel({
  selected,
  periods,
  compensation,
  canEdit,
  canViewCompensation,
  canEditCompensation,
  saving,
  onClosePeriod,
  onRehire,
}: PersonnelEmploymentHistoryPanelProps) {
  const [action, setAction] = useState<EmploymentAction>(null);
  const [date, setDate] = useState(() => ecuadorTodayIso());
  const [exitType, setExitType] = useState<PersonnelEmploymentExitType>('resignation');
  const [exitReason, setExitReason] = useState('');
  const [compensationStatus, setCompensationStatus] = useState<PersonnelEmploymentCompensationStatus>('pending');
  const [exitNotes, setExitNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setAction(null);
    setDate(ecuadorTodayIso());
    setExitType('resignation');
    setExitReason('');
    setCompensationStatus('pending');
    setExitNotes('');
    setFormError('');
  }, [selected.id]);

  const activePeriod = periods.find((period) => period.end_date === null && period.exit_type === null);
  const currentAction = selected.status === 'active' ? 'exit' : 'rehire';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!date) {
      setFormError('Selecciona la fecha del movimiento laboral.');
      return;
    }
    if (action === 'exit') {
      if (!activePeriod) {
        setFormError('No se encontró un período laboral vigente para cerrar.');
        return;
      }
      if (activePeriod.start_date && date < activePeriod.start_date) {
        setFormError('La fecha de salida no puede ser anterior al ingreso del período.');
        return;
      }
      const saved = await onClosePeriod({
        endDate: date,
        exitType,
        exitReason: exitReason.trim(),
        compensationStatus,
        exitNotes: exitNotes.trim(),
      }).catch((cause: unknown) => {
        setFormError(cause instanceof Error ? cause.message : 'No se pudo registrar la salida.');
        return false;
      });
      if (saved) setAction(null);
      return;
    }
    const lastEndDate = periods.reduce<string | null>((latest, period) => {
      if (!period.exit_type || !period.end_date) return latest;
      return !latest || period.end_date > latest ? period.end_date : latest;
    }, null);
    if (lastEndDate && date <= lastEndDate) {
      setFormError('El reingreso debe ser posterior a la última fecha de salida registrada.');
      return;
    }
    const saved = await onRehire(date).catch((cause: unknown) => {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo registrar el reingreso.');
      return false;
    });
    if (saved) setAction(null);
  };

  return (
    <section className="personnel-employment-history" aria-label={`Historial laboral de ${selected.full_name}`}>
      <header className="personnel-section-header">
        <div>
          <h3><BriefcaseBusiness size={16} aria-hidden="true" /> Períodos de colaboración</h3>
          <p>Cada reingreso inicia un período nuevo dentro de la misma ficha.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className={currentAction === 'exit' ? 'personnel-employment-action is-exit' : 'personnel-employment-action'}
            disabled={saving || (currentAction === 'exit' && !activePeriod)}
            onClick={() => {
              setDate(ecuadorTodayIso());
              setFormError('');
              setAction(currentAction);
            }}
          >
            {currentAction === 'exit' ? <><UserRoundX size={14} /> Registrar salida</> : <><ArrowDownLeft size={14} /> Registrar reingreso</>}
          </button>
        )}
      </header>

      {selected.status === 'active' && !activePeriod && (
        <p className="personnel-history-inline-warning" role="status">
          Falta el período vigente de esta ficha. Recarga la página para actualizar el historial.
        </p>
      )}

      {periods.length > 0 ? (
        <ol className="personnel-employment-period-list">
          {periods.map((period) => {
            const isOpen = period.end_date === null && period.exit_type === null;
            const exitLabel = period.exit_type ? EXIT_TYPE_LABEL[period.exit_type] || period.exit_type : '';
            const compensationRecord = compensation.find((item) => item.period_id === period.id);
            return (
              <li key={period.id} className={`personnel-employment-period-card ${isOpen ? 'is-current' : ''}`}>
                <span className="personnel-employment-period-icon" aria-hidden="true">
                  {isOpen ? <BriefcaseBusiness size={16} /> : <CalendarDays size={16} />}
                </span>
                <div className="personnel-employment-period-main">
                  <div className="personnel-employment-period-heading">
                    <b>{isOpen ? 'Período vigente' : exitLabel || 'Período anterior'}</b>
                    {period.source === 'legacy' && <small>Importado de la ficha anterior</small>}
                  </div>
                  <p>
                    {period.start_date ? formatEcuadorDate(period.start_date, 'medium') : 'Ingreso sin fecha registrada'}
                    {' — '}
                    {period.end_date ? formatEcuadorDate(period.end_date, 'medium') : isOpen ? 'Actualidad' : 'Salida sin fecha registrada'}
                  </p>
                  {period.exit_reason && <small><strong>Motivo:</strong> {period.exit_reason}</small>}
                  {!isOpen && canViewCompensation && compensationRecord?.compensation_status && (
                    <small className="personnel-employment-compensation">
                      <CircleDollarSign size={13} aria-hidden="true" />
                      {COMPENSATION_STATUS_LABEL[compensationRecord.compensation_status]}
                    </small>
                  )}
                  {canViewCompensation && compensationRecord?.exit_notes && <small className="personnel-employment-notes">{compensationRecord.exit_notes}</small>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="personnel-history-inline-warning">Todavía no hay períodos laborales registrados.</p>
      )}

      {action && (
        <form className="personnel-employment-form" onSubmit={(event) => void submit(event)}>
          <div className="personnel-employment-form-heading">
            <h4>{action === 'exit' ? 'Registrar salida laboral' : 'Registrar reingreso'}</h4>
            <button type="button" className="personnel-employment-cancel" disabled={saving} onClick={() => setAction(null)}>
              Cancelar
            </button>
          </div>

          {action === 'exit' ? (
            <div className="personnel-form-grid">
              <label>
                <span>Fecha de salida *</span>
                <input type="date" required value={date} disabled={saving} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                <span>Tipo de salida *</span>
                <select value={exitType} disabled={saving} onChange={(event) => setExitType(event.target.value as PersonnelEmploymentExitType)}>
                  {EXIT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {canEditCompensation && (
                <label>
                  <span>Situación de remuneración / liquidación</span>
                  <select value={compensationStatus} disabled={saving} onChange={(event) => setCompensationStatus(event.target.value as PersonnelEmploymentCompensationStatus)}>
                    {COMPENSATION_STATUS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>Motivo *</span>
                <input
                  list="personnel-exit-reasons"
                  required
                  minLength={2}
                  maxLength={1000}
                  placeholder="Estudios, nuevo empleo, motivo personal…"
                  value={exitReason}
                  disabled={saving}
                  onChange={(event) => setExitReason(event.target.value)}
                />
                <datalist id="personnel-exit-reasons">
                  {EXIT_REASONS.map((reason) => <option key={reason} value={reason} />)}
                </datalist>
              </label>
              {canEditCompensation && (
                <label className="personnel-span-2">
                  <span>Notas de liquidación (opcional)</span>
                  <textarea rows={3} maxLength={2000} value={exitNotes} disabled={saving} onChange={(event) => setExitNotes(event.target.value)} />
                </label>
              )}
            </div>
          ) : (
            <div className="personnel-form-grid">
              <label>
                <span>Fecha de reingreso *</span>
                <input type="date" required value={date} disabled={saving} onChange={(event) => setDate(event.target.value)} />
              </label>
              <p className="personnel-employment-form-help">Se abrirá un período laboral nuevo y se conservarán los anteriores.</p>
            </div>
          )}

          {action === 'exit' && (
            <p className="personnel-employment-form-help">
              El registro conserva lo que ingreses; no calcula pagos ni determina obligaciones laborales.
            </p>
          )}
          {formError && <p className="personnel-alert is-error" role="alert">{formError}</p>}
          <div className="personnel-employment-form-actions">
            <button type="submit" className="site-primary-button" disabled={saving}>
              <Plus size={14} /> {saving ? 'Guardando…' : action === 'exit' ? 'Cerrar período' : 'Guardar reingreso'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
