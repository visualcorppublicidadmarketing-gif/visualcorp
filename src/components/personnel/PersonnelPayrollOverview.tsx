import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Lock,
  Scale,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { EmptyState } from '../feedback';
import {
  buildCsvDocument,
  calculateEcuadorLaborEntitlements,
  calculateMonthlyEquivalent,
  ecuadorTodayIso,
  formatMoney,
  getEcuadorFiscalConfig,
  summarizeDeductionsByPeriod,
} from './personnelDomain';
import type {
  CompensationEntry,
  PayrollDeduction,
  PersonnelRecord,
} from './personnelTypes';

interface PersonnelPayrollOverviewProps {
  periodMonth: string;
  onChangePeriodMonth: (month: string) => void;
  personnel: PersonnelRecord[];
  compensationByPersonnel: Map<string, CompensationEntry[]>;
  deductions: PayrollDeduction[];
  canViewCompensation: boolean;
  onOpenPersonnel: (personnelId: string, tab?: 'ficha' | 'salarios') => void;
}

export function PersonnelPayrollOverview({
  periodMonth,
  onChangePeriodMonth,
  personnel,
  compensationByPersonnel,
  deductions,
  canViewCompensation,
  onOpenPersonnel,
}: PersonnelPayrollOverviewProps) {
  const [revealAmounts, setRevealAmounts] = useState(false);
  const [showLegalGuide, setShowLegalGuide] = useState(false);

  const fiscalYear = Number(periodMonth.slice(0, 4)) || undefined;
  const fiscalConfig = getEcuadorFiscalConfig(fiscalYear);
  const todayIso = ecuadorTodayIso();

  // Auto-relock revealed payroll amounts after 60s to prevent office shoulder-surfing.
  useEffect(() => {
    if (!revealAmounts) return undefined;
    const timer = window.setTimeout(() => setRevealAmounts(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealAmounts]);

  const activeRows = useMemo(() => {
    return personnel
      .filter((person) => person.status === 'active')
      .map((person) => {
        const compEntries = compensationByPersonnel.get(person.id) || [];
        const latestComp = compEntries[0] || null;
        const monthlyBase = latestComp
          ? calculateMonthlyEquivalent(Number(latestComp.amount), latestComp.pay_period)
          : null;

        const personDeductions = deductions.filter((item) => item.personnel_id === person.id);
        const periodSummary = summarizeDeductionsByPeriod(personDeductions, periodMonth);
        const entitlements = calculateEcuadorLaborEntitlements(
          person.start_date,
          todayIso,
          monthlyBase ?? 0,
          fiscalConfig,
        );
        const estimatedNetAfterDeductions =
          monthlyBase != null
            ? Math.max(0, monthlyBase - periodSummary.deductibleTotal)
            : null;

        return {
          person,
          latestComp,
          monthlyBase,
          periodSummary,
          entitlements,
          estimatedNetAfterDeductions,
        };
      });
  }, [personnel, compensationByPersonnel, deductions, periodMonth, todayIso, fiscalConfig]);

  const totals = useMemo(() => {
    let baseMonthlySum = 0;
    let deductibleSum = 0;
    let pendingCount = 0;
    let iessPatronalSum = 0;

    for (const row of activeRows) {
      if (row.monthlyBase != null) {
        baseMonthlySum += row.monthlyBase;
        iessPatronalSum += row.entitlements.estimatedIessPatronal;
      }
      deductibleSum += row.periodSummary.deductibleTotal;
      pendingCount += row.periodSummary.periodItems.filter(
        (item) => item.status === 'pending_authorization',
      ).length;
    }

    return {
      baseMonthlySum,
      deductibleSum,
      netSum: Math.max(0, baseMonthlySum - deductibleSum),
      iessPatronalSum,
      pendingCount,
    };
  }, [activeRows]);

  if (!canViewCompensation) {
    return (
      <section className="personnel-payroll-panel">
        <EmptyState
          icon={Lock}
          title="Acceso restringido a compensación y pre-nómina"
          text="Tu perfil no tiene el permiso personnel.view_compensation para consultar salarios base ni deducciones."
        />
      </section>
    );
  }

  const handleExportCsv = () => {
    const csv = buildCsvDocument(
      [
        'Período',
        'Colaborador',
        'Área',
        'Fecha ingreso',
        'Periodicidad registrada',
        'Salario base mensual eq. (USD)',
        'Deducciones autorizadas/entregadas/aplicadas (USD)',
        'Por autorizar (USD)',
        'Neto referencial post-deducciones (USD)',
        'IESS Personal ref. 9.45% (USD)',
        'IESS Patronal ref. 12.15% (USD)',
        'Fondos de reserva ref. 8.33% (USD)',
        'Días vacaciones/año Art. 69',
      ],
      activeRows.map(({ person, latestComp, monthlyBase, periodSummary, entitlements, estimatedNetAfterDeductions }) => [
        periodMonth,
        person.full_name,
        person.department,
        person.start_date || '',
        latestComp?.pay_period || 'Sin salario base',
        monthlyBase != null ? monthlyBase.toFixed(2) : '',
        periodSummary.deductibleTotal.toFixed(2),
        periodSummary.pendingTotal.toFixed(2),
        estimatedNetAfterDeductions != null ? estimatedNetAfterDeductions.toFixed(2) : '',
        monthlyBase != null ? entitlements.estimatedIessPersonal.toFixed(2) : '',
        monthlyBase != null ? entitlements.estimatedIessPatronal.toFixed(2) : '',
        monthlyBase != null ? entitlements.estimatedReserveFundMonthly.toFixed(2) : '',
        entitlements.vacationDaysPerYear,
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `visualcorp-prenomina-ec-${periodMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="personnel-payroll-panel" aria-label="Pre-nómina referencial Ecuador">
      <div className="personnel-payroll-header">
        <div className="personnel-payroll-controls">
          <label>
            <span>Período mensual</span>
            <input
              type="month"
              value={periodMonth}
              onChange={(event) => onChangePeriodMonth(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="site-secondary-button"
            aria-pressed={revealAmounts}
            onClick={() => setRevealAmounts((prev) => !prev)}
          >
            {revealAmounts ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{revealAmounts ? 'Ocultar montos (auto 60s)' : 'Mostrar montos'}</span>
          </button>

          <button type="button" className="site-secondary-button" onClick={handleExportCsv}>
            <Download size={14} /> Exportar pre-nómina CSV
          </button>
        </div>

        <button
          type="button"
          className="site-secondary-button"
          aria-expanded={showLegalGuide}
          onClick={() => setShowLegalGuide((prev) => !prev)}
        >
          <Scale size={14} />
          <span>Parámetros Ecuador {fiscalConfig.year} (SBU ${fiscalConfig.sbu})</span>
          {showLegalGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {showLegalGuide && (
        <div className="personnel-legal-guide" role="region" aria-label="Parámetros laborales de referencia en Ecuador">
          <div className="personnel-legal-grid">
            <article>
              <b>SBU {fiscalConfig.year}: ${fiscalConfig.sbu.toFixed(2)}</b>
              <small>{fiscalConfig.sbuResolution}. Ningún valor legal se fija manualmente en código si cambia el año fiscal.</small>
            </article>
            <article>
              <b>IESS y Fondos de Reserva</b>
              <small>Aporte personal 9,45% (referencial en rol) y costo patronal 12,15% (11,15% IESS + 0,5% SECAP + 0,5% IECE). Fondos de Reserva (8,33%) desde el mes 13.</small>
            </article>
            <article>
              <b>Décimos — Región Costa (Milagro)</b>
              <small>Décimo Tercero hasta {fiscalConfig.decimoTerceroDeadline}. Décimo Cuarto (1 SBU = ${fiscalConfig.sbu}) hasta {fiscalConfig.costaDecimoCuartoDeadline}, mensualizado salvo solicitud escrita en enero.</small>
            </article>
            <article>
              <b>Descuentos vs. Multas (Art. 44 / 54 / 64)</b>
              <small>El tiempo no trabajado se descuenta proporcionalmente sin multa. Toda multa disciplinaria exige Reglamento Interno aprobado en el SUT (obligatorio con 10+ trabajadores) y nunca puede superar el 10% mensual ni suspender sin sueldo.</small>
            </article>
          </div>
        </div>
      )}

      <div className="personnel-payroll-kpis" aria-live="polite">
        <article>
          <span>Masa base mensual equiv.</span>
          <b className="tabular-nums">{formatMoney(totals.baseMonthlySum, 'USD', { masked: !revealAmounts })}</b>
          <small>Sueldos Mensuales / Quincenales / Semanales</small>
        </article>
        <article>
          <span>Deducciones del período</span>
          <b className="tabular-nums is-deduction">
            {formatMoney(totals.deductibleSum, 'USD', { masked: !revealAmounts, signedMinus: true })}
          </b>
          <small>Autorizadas, entregadas a nómina o aplicadas</small>
        </article>
        <article className="is-net">
          <span>Estimado líquido referencial</span>
          <b className="tabular-nums">{formatMoney(totals.netSum, 'USD', { masked: !revealAmounts })}</b>
          <small>Antes de retención IESS personal / anticipos externos</small>
        </article>
        <article>
          <span>Costo patronal IESS ref. (12,15%)</span>
          <b className="tabular-nums">{formatMoney(totals.iessPatronalSum, 'USD', { masked: !revealAmounts })}</b>
          <small>
            {totals.pendingCount > 0
              ? `${totals.pendingCount} descuento(s) aún por autorizar`
              : 'Sin solicitudes pendientes de autorización'}
          </small>
        </article>
      </div>

      <div className="personnel-private-note">
        <ShieldAlert size={14} aria-hidden="true" />
        <span>
          Vista referencial de preparación para contabilidad externa y rol IESS/SUT. Los montos están enmascarados por defecto para proteger privacidad en oficina.
        </span>
      </div>

      {activeRows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin colaboradores activos para pre-nómina"
          text="Crea o activa fichas de personal para consolidar compensación base y deducciones."
        />
      ) : (
        <div className="table-wrap">
          <table className="personnel-payroll-table">
            <thead>
              <tr>
                <th scope="col">Colaborador</th>
                <th scope="col" className="is-right">Base mensual eq.</th>
                <th scope="col" className="is-right">Deducciones período</th>
                <th scope="col" className="is-right">Estimado líquido</th>
                <th scope="col" className="is-right">IESS pers. (9,45%)</th>
                <th scope="col" className="is-right">Fondos Res. (8,33%)</th>
                <th scope="col">Estado</th>
                <th scope="col" className="is-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map(({ person, latestComp, monthlyBase, periodSummary, entitlements, estimatedNetAfterDeductions }) => {
                const pendingForPerson = periodSummary.periodItems.filter((item) => item.status === 'pending_authorization').length;

                return (
                  <tr key={person.id}>
                    <td data-label="Colaborador">
                      <div className="personnel-table-person">
                        <b>{person.full_name}</b>
                        <small>
                          {person.department || 'Sin área'} ·{' '}
                          {entitlements.monthsWorked > 0
                            ? `${entitlements.monthsWorked} meses (${entitlements.vacationDaysPerYear}d vac./año)`
                            : 'Sin fecha de ingreso'}
                        </small>
                      </div>
                    </td>

                    <td data-label="Base mensual" className="is-right tabular-nums">
                      {monthlyBase != null ? (
                        <div>
                          <b>{formatMoney(monthlyBase, latestComp?.currency_code, { masked: !revealAmounts })}</b>
                          <small className="personnel-cell-sub">{latestComp?.pay_period}</small>
                        </div>
                      ) : (
                        <span className="personnel-muted-note">{latestComp ? latestComp.pay_period : 'Sin registro'}</span>
                      )}
                    </td>

                    <td data-label="Deducciones" className="is-right tabular-nums">
                      <span className="personnel-deduction-cell">
                        {formatMoney(periodSummary.deductibleTotal, 'USD', { masked: !revealAmounts, signedMinus: periodSummary.deductibleTotal > 0 })}
                      </span>
                      {periodSummary.pendingTotal > 0 && (
                        <small className="personnel-cell-sub">
                          +{formatMoney(periodSummary.pendingTotal, 'USD', { masked: !revealAmounts })} por autorizar
                        </small>
                      )}
                    </td>

                    <td data-label="Estimado líquido" className="is-right tabular-nums">
                      {estimatedNetAfterDeductions != null ? (
                        <b>{formatMoney(estimatedNetAfterDeductions, latestComp?.currency_code, { masked: !revealAmounts })}</b>
                      ) : (
                        <span className="personnel-muted-note">Por definir</span>
                      )}
                    </td>

                    <td data-label="IESS Personal" className="is-right tabular-nums">
                      {monthlyBase != null
                        ? formatMoney(entitlements.estimatedIessPersonal, 'USD', { masked: !revealAmounts })
                        : '—'}
                    </td>

                    <td data-label="Fondos Reserva" className="is-right tabular-nums">
                      {monthlyBase == null ? (
                        '—'
                      ) : entitlements.reserveFundEligible ? (
                        formatMoney(entitlements.estimatedReserveFundMonthly, 'USD', { masked: !revealAmounts })
                      ) : (
                        <span className="personnel-muted-note">Mes {entitlements.monthsWorked + 1}/13</span>
                      )}
                    </td>

                    <td data-label="Estado">
                      {pendingForPerson > 0 ? (
                        <span className="vc-semiotic-badge is-warning is-dashed is-pill">
                          {pendingForPerson} por autorizar
                        </span>
                      ) : periodSummary.periodItems.length > 0 ? (
                        <span className="vc-semiotic-badge is-positive is-pill">Al día</span>
                      ) : (
                        <span className="vc-semiotic-badge is-neutral is-pill">Sin novedades</span>
                      )}
                    </td>

                    <td data-label="Detalle" className="is-right">
                      <button
                        type="button"
                        className="site-secondary-button"
                        onClick={() => onOpenPersonnel(person.id, 'salarios')}
                      >
                        Abrir nómina <ArrowUpRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
